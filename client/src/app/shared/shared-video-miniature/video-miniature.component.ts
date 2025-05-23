import { NgClass, NgFor, NgIf } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  LOCALE_ID,
  OnInit,
  booleanAttribute,
  numberAttribute,
  inject,
  input,
  output
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { AuthService, ScreenService, ServerService, User } from '@app/core'
import { HTMLServerConfig, VideoExistInPlaylist, VideoPlaylistType, VideoPrivacy, VideoState } from '@peertube/peertube-models'
import { switchMap } from 'rxjs/operators'
import { LinkType } from '../../../types/link.type'
import { ActorAvatarComponent } from '../shared-actor-image/actor-avatar.component'
import { LinkComponent } from '../shared-main/common/link.component'
import { DateToggleComponent } from '../shared-main/date/date-toggle.component'
import { Video } from '../shared-main/video/video.model'
import { VideoService } from '../shared-main/video/video.service'
import { VideoThumbnailComponent } from '../shared-thumbnail/video-thumbnail.component'
import { VideoPlaylistService } from '../shared-video-playlist/video-playlist.service'
import { VideoViewsCounterComponent } from '../shared-video/video-views-counter.component'
import { VideoActionsDisplayType, VideoActionsDropdownComponent } from './video-actions-dropdown.component'
import { ActorHostComponent } from '../standalone-actor/actor-host.component'

export type MiniatureDisplayOptions = {
  date?: boolean
  views?: boolean
  avatar?: boolean
  privacyLabel?: boolean
  privacyText?: boolean
  state?: boolean
  blacklistInfo?: boolean
  nsfw?: boolean

  by?: boolean
  forceChannelInBy?: boolean
}

@Component({
  selector: 'my-video-miniature',
  styleUrls: [ './video-miniature.component.scss' ],
  templateUrl: './video-miniature.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgClass,
    VideoThumbnailComponent,
    NgIf,
    ActorAvatarComponent,
    LinkComponent,
    DateToggleComponent,
    VideoViewsCounterComponent,
    RouterLink,
    NgFor,
    VideoActionsDropdownComponent,
    ActorHostComponent
  ]
})
export class VideoMiniatureComponent implements OnInit {
  private screenService = inject(ScreenService)
  private serverService = inject(ServerService)
  private authService = inject(AuthService)
  private videoPlaylistService = inject(VideoPlaylistService)
  private videoService = inject(VideoService)
  private cd = inject(ChangeDetectorRef)
  private localeId = inject(LOCALE_ID)

  readonly user = input<User>(undefined)
  readonly video = input<Video>(undefined)
  readonly containedInPlaylists = input<VideoExistInPlaylist[]>(undefined)

  readonly displayOptions = input<MiniatureDisplayOptions>({
    date: true,
    views: true,
    by: true,
    avatar: true,
    privacyLabel: false,
    privacyText: false,
    state: false,
    blacklistInfo: false,
    forceChannelInBy: false
  })

  readonly displayVideoActions = input(true)
  readonly videoActionsDisplayOptions = input<VideoActionsDisplayType>({
    playlist: true,
    download: false,
    update: true,
    blacklist: true,
    delete: true,
    report: true,
    duplicate: true,
    mute: true,
    studio: false,
    stats: false
  })

  readonly actorImageSize = input(34, { transform: numberAttribute })

  readonly displayAsRow = input(false, { transform: booleanAttribute })

  readonly videoLinkType = input<LinkType>('internal')

  readonly videoBlocked = output()
  readonly videoUnblocked = output()
  readonly videoRemoved = output()
  readonly videoAccountMuted = output()

  showActions = false
  serverConfig: HTMLServerConfig

  addToWatchLaterText: string
  addedToWatchLaterText: string
  inWatchLaterPlaylist: boolean
  channelLinkTitle = ''

  watchLaterPlaylist: {
    id: number
    playlistElementId?: number
  }

  videoRouterLink: string | any[] = []
  videoHref: string
  videoTarget: string

  ownerRouterLink: string | any[] = []
  ownerHref: string
  ownerTarget: string

  private ownerDisplayType: 'account' | 'videoChannel'
  private actionsLoaded = false

  get authorAccount () {
    return this.serverConfig.client.videos.miniature.preferAuthorDisplayName
      ? this.video().account.displayName
      : this.video().account.name
  }

  get authorChannel () {
    return this.serverConfig.client.videos.miniature.preferAuthorDisplayName
      ? this.video().channel.displayName
      : this.video().channel.name
  }

  get isVideoBlur () {
    return this.video().isVideoNSFWForUser(this.user(), this.serverConfig)
  }

  ngOnInit () {
    this.serverConfig = this.serverService.getHTMLConfig()

    this.buildVideoLink()
    this.buildOwnerLink()

    this.setUpBy()

    this.channelLinkTitle = $localize`${this.video().channel.name} (channel page)`

    // We rely on mouseenter to lazy load actions
    if (this.screenService.isInTouchScreen()) {
      this.loadActions()
    }
  }

  buildVideoLink () {
    const videoLinkType = this.videoLinkType()
    const video = this.video()
    if (videoLinkType === 'internal' || !video.url) {
      this.videoRouterLink = Video.buildWatchUrl(video)
      return
    }

    if (videoLinkType === 'external') {
      this.videoRouterLink = null
      this.videoHref = video.url
      this.videoTarget = '_blank'
      return
    }

    // Lazy load
    this.videoRouterLink = [ '/search/lazy-load-video', { url: video.url } ]
  }

  buildOwnerLink () {
    const video = this.video()

    const linkType = this.videoLinkType()

    if (linkType === 'internal' || !video.channel.url) {
      this.ownerRouterLink = `/c/${video.byVideoChannel}`
      return
    }

    if (linkType === 'external') {
      this.ownerRouterLink = null
      this.ownerHref = video.channel.url
      this.ownerTarget = '_blank'
      return
    }

    // Lazy load
    this.ownerRouterLink = [ '/search/lazy-load-channel', { url: video.channel.url } ]
  }

  // ---------------------------------------------------------------------------

  displayOwnerAccount () {
    return this.ownerDisplayType === 'account'
  }

  displayOwnerVideoChannel () {
    return this.ownerDisplayType === 'videoChannel'
  }

  isUnlistedVideo () {
    return this.video().privacy.id === VideoPrivacy.UNLISTED
  }

  isPrivateVideo () {
    return this.video().privacy.id === VideoPrivacy.PRIVATE
  }

  isPasswordProtectedVideo () {
    return this.video().privacy.id === VideoPrivacy.PASSWORD_PROTECTED
  }

  getStateLabel (video: Video) {
    if (!video.state) return ''

    if (video.privacy.id !== VideoPrivacy.PRIVATE && video.state.id === VideoState.PUBLISHED) {
      return $localize`Published`
    }

    if (video.scheduledUpdate) {
      const updateAt = new Date(video.scheduledUpdate.updateAt.toString()).toLocaleString(this.localeId)
      return $localize`Publication scheduled on ${updateAt}`
    }

    switch (video.state.id) {
      case VideoState.TRANSCODING_FAILED:
        return $localize`Transcoding failed`

      case VideoState.TO_MOVE_TO_FILE_SYSTEM:
        return $localize`Moving to file system`

      case VideoState.TO_MOVE_TO_FILE_SYSTEM_FAILED:
        return $localize`Moving to file system failed`

      case VideoState.TO_MOVE_TO_EXTERNAL_STORAGE:
        return $localize`Moving to external storage`

      case VideoState.TO_MOVE_TO_EXTERNAL_STORAGE_FAILED:
        return $localize`Move to external storage failed`

      case VideoState.TO_TRANSCODE:
        return video.waitTranscoding === true
          ? $localize`Waiting transcoding`
          : $localize`To transcode`

      case VideoState.TO_IMPORT:
        return $localize`To import`

      case VideoState.TO_EDIT:
        return $localize`To edit`
    }

    return ''
  }

  getAriaLabel () {
    return $localize`Watch video ${this.video().name}`
  }

  loadActions () {
    if (this.actionsLoaded) return
    if (this.displayVideoActions()) this.showActions = true

    this.loadWatchLater()

    this.actionsLoaded = true
  }

  onVideoBlocked () {
    this.videoBlocked.emit()
  }

  onVideoUnblocked () {
    this.videoUnblocked.emit()
  }

  onVideoRemoved () {
    this.videoRemoved.emit()
  }

  onVideoAccountMuted () {
    this.videoAccountMuted.emit()
  }

  isUserLoggedIn () {
    return this.authService.isLoggedIn()
  }

  onWatchLaterClick (currentState: boolean) {
    if (currentState === true) this.removeFromWatchLater()
    else this.addToWatchLater()

    this.inWatchLaterPlaylist = !currentState
  }

  addToWatchLater () {
    const body = { videoId: this.video().id }

    this.videoPlaylistService.addVideoInPlaylist(this.watchLaterPlaylist.id, body)
      .subscribe(
        res => {
          this.watchLaterPlaylist.playlistElementId = res.videoPlaylistElement.id
        }
      )
  }

  removeFromWatchLater () {
    this.videoPlaylistService.removeVideoFromPlaylist(
      this.watchLaterPlaylist.id,
      this.watchLaterPlaylist.playlistElementId,
      this.video().id
    )
      .subscribe(
        _ => {
          // empty
        }
      )
  }

  isWatchLaterPlaylistDisplayed () {
    return !this.screenService.isInTouchScreen() &&
      this.displayVideoActions() &&
      this.isUserLoggedIn() &&
      this.inWatchLaterPlaylist !== undefined
  }

  getClasses () {
    return {
      'display-as-row': this.displayAsRow(),
      'has-avatar': this.displayOptions().avatar
    }
  }

  private setUpBy () {
    if (this.displayOptions().forceChannelInBy) {
      this.ownerDisplayType = 'videoChannel'
      return
    }

    this.ownerDisplayType = this.videoService.buildDefaultOwnerDisplayType(this.video())
  }

  private loadWatchLater () {
    if (this.screenService.isInTouchScreen() || !this.displayVideoActions() || !this.isUserLoggedIn()) return

    this.authService.userInformationLoaded
      .pipe(switchMap(() => this.videoPlaylistService.listenToVideoPlaylistChange(this.video().id)))
      .subscribe(existResult => {
        const watchLaterPlaylist = this.authService.getUser().specialPlaylists.find(p => p.type === VideoPlaylistType.WATCH_LATER)
        const existsInWatchLater = existResult.find(r => r.playlistId === watchLaterPlaylist.id)
        this.inWatchLaterPlaylist = false

        this.watchLaterPlaylist = {
          id: watchLaterPlaylist.id
        }

        if (existsInWatchLater) {
          this.inWatchLaterPlaylist = true
          this.watchLaterPlaylist.playlistElementId = existsInWatchLater.playlistElementId
        }

        this.cd.markForCheck()
      })

    this.videoPlaylistService.runVideoExistsInPlaylistCheck(this.video().id)
  }
}
