import { environment } from 'src/environments/environment'
import { Component, ElementRef, OnInit, booleanAttribute, inject, input } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { buildVideoOrPlaylistEmbed } from '@root-helpers/video'
import { buildVideoEmbedLink, decorateVideoLink } from '@peertube/peertube-core-utils'
import { Video } from '@peertube/peertube-models'

export type EmbedVideoInput = Pick<Video, 'name' | 'uuid'> & Partial<Pick<Video, 'aspectRatio'>>

@Component({
  selector: 'my-embed',
  styleUrls: [ './embed.component.scss' ],
  templateUrl: './embed.component.html',
  standalone: true
})
export class EmbedComponent implements OnInit {
  private sanitizer = inject(DomSanitizer)
  private el = inject(ElementRef)

  readonly video = input.required<EmbedVideoInput>()
  readonly enableAPI = input<boolean, unknown>(undefined, { transform: booleanAttribute })
  readonly mute = input<boolean, unknown>(undefined, { transform: booleanAttribute })
  readonly autoplay = input<boolean, unknown>(undefined, { transform: booleanAttribute })

  embedHTML: SafeHtml

  ngOnInit () {
    const html = buildVideoOrPlaylistEmbed({
      embedUrl: decorateVideoLink({
        url: buildVideoEmbedLink(this.video(), environment.originServerUrl),

        title: false,
        warningTitle: false,
        api: this.enableAPI(),
        muted: this.mute(),
        autoplay: this.autoplay()
      }),
      embedTitle: this.video().name,
      aspectRatio: this.video().aspectRatio
    })

    this.embedHTML = this.sanitizer.bypassSecurityTrustHtml(html)
  }

  getIframe () {
    return (this.el.nativeElement as HTMLElement).querySelector('iframe')
  }
}
