import { Component, inject, input } from '@angular/core'
import { Notifier } from '@app/core'
import { FormsModule } from '@angular/forms'
import { PeertubeCheckboxComponent } from '../../../shared/shared-forms/peertube-checkbox.component'
import { RedundancyService } from '@app/shared/shared-main/video/redundancy.service'

@Component({
  selector: 'my-redundancy-checkbox',
  templateUrl: './redundancy-checkbox.component.html',
  imports: [ PeertubeCheckboxComponent, FormsModule ]
})
export class RedundancyCheckboxComponent {
  private notifier = inject(Notifier)
  private redundancyService = inject(RedundancyService)

  readonly redundancyAllowed = input<boolean>(undefined)
  readonly host = input<string>(undefined)

  updateRedundancyState () {
    this.redundancyService.updateRedundancy(this.host(), this.redundancyAllowed())
      .subscribe({
        next: () => {
          const stateLabel = this.redundancyAllowed() ? $localize`enabled` : $localize`disabled`

          this.notifier.success($localize`Redundancy for ${this.host()} is ${stateLabel}`)
        },

        error: err => this.notifier.error(err.message)
      })
  }
}
