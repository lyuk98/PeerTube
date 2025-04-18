import { Subject } from 'rxjs'
import { Component, OnInit, inject, input, output } from '@angular/core'
import { ComponentPagination, hasMoreItems, Notifier } from '@app/core'
import { AbuseState, VideoState } from '@peertube/peertube-models'
import { CommonModule } from '@angular/common'
import { GlobalIconComponent } from '../shared-icons/global-icon.component'
import { RouterLink } from '@angular/router'
import { FromNowPipe } from '../shared-main/date/from-now.pipe'
import { InfiniteScrollerDirective } from '../shared-main/common/infinite-scroller.directive'
import { UserNotificationService } from '../shared-main/users/user-notification.service'
import { UserNotification } from '../shared-main/users/user-notification.model'

@Component({
  selector: 'my-user-notifications',
  templateUrl: 'user-notifications.component.html',
  styleUrls: [ 'user-notifications.component.scss' ],
  imports: [ CommonModule, GlobalIconComponent, RouterLink, FromNowPipe, InfiniteScrollerDirective ]
})
export class UserNotificationsComponent implements OnInit {
  private userNotificationService = inject(UserNotificationService)
  private notifier = inject(Notifier)

  readonly ignoreLoadingBar = input(false)
  readonly infiniteScroll = input(true)
  readonly itemsPerPage = input(20)
  readonly markAllAsReadSubject = input<Subject<boolean>>(undefined)
  readonly userNotificationReload = input<Subject<boolean>>(undefined)

  readonly notificationsLoaded = output()

  notifications: UserNotification[] = []
  sortField = 'createdAt'

  componentPagination: ComponentPagination

  onDataSubject = new Subject<any[]>()

  ngOnInit () {
    this.componentPagination = {
      currentPage: 1,
      itemsPerPage: this.itemsPerPage(),
      totalItems: null
    }

    this.loadNotifications()

    const markAllAsReadSubject = this.markAllAsReadSubject()
    if (markAllAsReadSubject) {
      markAllAsReadSubject.subscribe(() => this.markAllAsRead())
    }

    const userNotificationReload = this.userNotificationReload()
    if (userNotificationReload) {
      userNotificationReload.subscribe(() => this.loadNotifications(true))
    }
  }

  loadNotifications (reset?: boolean) {
    if (reset) this.componentPagination.currentPage = 1

    const options = {
      pagination: this.componentPagination,
      ignoreLoadingBar: this.ignoreLoadingBar(),
      sort: {
        field: this.sortField,
        // if we order by creation date, we want DESC. all other fields are ASC (like unread).
        order: this.sortField === 'createdAt' ? -1 : 1
      }
    }

    this.userNotificationService.listMyNotifications(options)
      .subscribe({
        next: result => {
          this.notifications = reset ? result.data : this.notifications.concat(result.data)
          this.componentPagination.totalItems = result.total

          this.notificationsLoaded.emit()

          this.onDataSubject.next(result.data)
        },

        error: err => this.notifier.error(err.message)
      })
  }

  onNearOfBottom () {
    if (this.infiniteScroll() === false) return

    this.componentPagination.currentPage++

    if (hasMoreItems(this.componentPagination)) {
      this.loadNotifications()
    }
  }

  markAsRead (notification: UserNotification) {
    if (notification.read) return

    this.userNotificationService.markAsRead(notification)
      .subscribe({
        next: () => {
          notification.read = true
        },

        error: err => this.notifier.error(err.message)
      })
  }

  markAllAsRead () {
    this.userNotificationService.markAllAsRead()
      .subscribe({
        next: () => {
          for (const notification of this.notifications) {
            notification.read = true
          }
        },

        error: err => this.notifier.error(err.message)
      })
  }

  changeSortColumn (column: string) {
    this.componentPagination = {
      currentPage: 1,
      itemsPerPage: this.itemsPerPage(),
      totalItems: null
    }
    this.sortField = column
    this.loadNotifications(true)
  }

  isAbuseAccepted (notification: UserNotification) {
    return notification.abuse.state === AbuseState.ACCEPTED
  }

  isVideoPublished (notification: UserNotification) {
    return notification.video.state.id === VideoState.PUBLISHED
  }
}
