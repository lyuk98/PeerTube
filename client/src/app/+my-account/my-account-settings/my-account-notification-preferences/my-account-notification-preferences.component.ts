import { NgFor, NgIf } from '@angular/common'
import { Component, OnInit, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Notifier, ServerService, User } from '@app/core'
import { UserNotificationService } from '@app/shared/shared-main/users/user-notification.service'
import { objectKeysTyped } from '@peertube/peertube-core-utils'
import { UserNotificationSetting, UserNotificationSettingValue, UserRight, UserRightType } from '@peertube/peertube-models'
import { debounce } from 'lodash-es'
import { InputSwitchComponent } from '../../../shared/shared-forms/input-switch.component'

@Component({
  selector: 'my-account-notification-preferences',
  templateUrl: './my-account-notification-preferences.component.html',
  styleUrls: [ './my-account-notification-preferences.component.scss' ],
  imports: [ NgIf, NgFor, InputSwitchComponent, FormsModule ]
})
export class MyAccountNotificationPreferencesComponent implements OnInit {
  private userNotificationService = inject(UserNotificationService)
  private serverService = inject(ServerService)
  private notifier = inject(Notifier)

  readonly user = model<User>(undefined)

  notificationSettingGroups: { label: string, keys: (keyof UserNotificationSetting)[] }[] = []
  emailNotifications: { [id in keyof UserNotificationSetting]?: boolean } = {}
  webNotifications: { [id in keyof UserNotificationSetting]?: boolean } = {}
  labelNotifications: { [id in keyof UserNotificationSetting]?: string } = {}
  rightNotifications: { [id in keyof Partial<UserNotificationSetting>]?: UserRightType } = {}
  emailEnabled = false

  private savePreferences = debounce(this.savePreferencesImpl.bind(this), 500)

  constructor () {
    this.notificationSettingGroups = [
      {
        label: $localize`Social`,
        keys: [
          'newVideoFromSubscription',
          'newFollow',
          'commentMention'
        ]
      },

      {
        label: $localize`Your videos`,
        keys: [
          'newCommentOnMyVideo',
          'blacklistOnMyVideo',
          'myVideoPublished',
          'myVideoImportFinished',
          'myVideoStudioEditionFinished',
          'myVideoTranscriptionGenerated'
        ]
      },

      {
        label: $localize`Moderation`,
        keys: [
          'abuseStateChange',
          'abuseNewMessage',
          'abuseAsModerator',
          'videoAutoBlacklistAsModerator',
          'newUserRegistration'
        ]
      },

      {
        label: $localize`Administration`,
        keys: [
          'newInstanceFollower',
          'autoInstanceFollowing',
          'newPeerTubeVersion',
          'newPluginVersion'
        ]
      }
    ]

    this.rightNotifications = {
      abuseAsModerator: UserRight.MANAGE_ABUSES,
      videoAutoBlacklistAsModerator: UserRight.MANAGE_VIDEO_BLACKLIST,
      newUserRegistration: UserRight.MANAGE_USERS,
      newInstanceFollower: UserRight.MANAGE_SERVER_FOLLOW,
      autoInstanceFollowing: UserRight.MANAGE_CONFIGURATION,
      newPeerTubeVersion: UserRight.MANAGE_DEBUG,
      newPluginVersion: UserRight.MANAGE_DEBUG
    }
  }

  ngOnInit () {
    const config = this.serverService.getHTMLConfig()
    this.emailEnabled = config.email.enabled

    this.labelNotifications = {
      newVideoFromSubscription: $localize`New video or live from your subscriptions`,
      newCommentOnMyVideo: $localize`New comment on your video`,
      abuseAsModerator: $localize`New abuse`,
      videoAutoBlacklistAsModerator: $localize`An automatically blocked video is awaiting review`,
      blacklistOnMyVideo: $localize`One of your video is blocked/unblocked`,
      myVideoPublished: $localize`Video published (after transcoding/scheduled update)`,
      myVideoImportFinished: $localize`Video import finished`,
      newUserRegistration: $localize`A new user registered on ${config.instance.name}`,
      newFollow: $localize`You or one of your channels has a new follower`,
      commentMention: $localize`Someone mentioned you in video comments`,
      newInstanceFollower: $localize`${config.instance.name} has a new follower`,
      autoInstanceFollowing: $localize`${config.instance.name} automatically followed another platform`,
      abuseNewMessage: $localize`An abuse report received a new message`,
      abuseStateChange: $localize`One of your abuse reports has been accepted or rejected by moderators`,
      newPeerTubeVersion: $localize`A new PeerTube version is available`,
      newPluginVersion: $localize`One of your plugin/theme has a new available version`,
      myVideoStudioEditionFinished: $localize`Processing of edits has finished`,
      myVideoTranscriptionGenerated: $localize`The transcription of your video has been generated`
    }

    this.loadNotificationSettings()
  }

  hasUserRight (field: keyof UserNotificationSetting) {
    const rightToHave = this.rightNotifications[field]
    if (!rightToHave) return true // No rights needed

    return this.user().hasRight(rightToHave)
  }

  hasNotificationsInGroup (group: { keys: (keyof UserNotificationSetting)[] }) {
    return group.keys.some(k => this.hasUserRight(k))
  }

  getWebLabel (notificationType: keyof UserNotificationSetting) {
    return `Toggle web notification for "${this.labelNotifications[notificationType]}"`
  }

  getEmailLabel (notificationType: keyof UserNotificationSetting) {
    return `Toggle email notification for "${this.labelNotifications[notificationType]}"`
  }

  updateEmailSetting (field: keyof UserNotificationSetting, value: boolean) {
    this.user.update(u => {
      // FIXME: use immutable user object
      u.notificationSettings[field] = value === true
        ? u.notificationSettings[field] | UserNotificationSettingValue.EMAIL
        : u.notificationSettings[field] & ~UserNotificationSettingValue.EMAIL

      return u
    })

    this.savePreferences()
  }

  updateWebSetting (field: keyof UserNotificationSetting, value: boolean) {
    this.user.update(u => {
      // FIXME: use immutable user object
      u.notificationSettings[field] = value === true
        ? u.notificationSettings[field] | UserNotificationSettingValue.WEB
        : u.notificationSettings[field] & ~UserNotificationSettingValue.WEB

      return u
    })

    this.savePreferences()
  }

  private savePreferencesImpl () {
    this.userNotificationService.updateNotificationSettings(this.user().notificationSettings)
      .subscribe({
        next: () => {
          this.notifier.success($localize`Preferences saved`, undefined, 2000)
        },

        error: err => this.notifier.error(err.message)
      })
  }

  private loadNotificationSettings () {
    for (const key of objectKeysTyped(this.user().notificationSettings)) {
      const value = this.user().notificationSettings[key]
      this.emailNotifications[key] = !!(value & UserNotificationSettingValue.EMAIL)

      this.webNotifications[key] = !!(value & UserNotificationSettingValue.WEB)
    }
  }
}
