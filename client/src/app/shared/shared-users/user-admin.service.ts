import { SortMeta } from 'primeng/api'
import { from, Observable } from 'rxjs'
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { RestExtractor, RestPagination, RestService, ServerService, UserService } from '@app/core'
import { getBytes } from '@root-helpers/bytes'
import { arrayify, peertubeTranslate } from '@peertube/peertube-core-utils'
import { ResultList, User as UserServerModel, UserCreate, UserUpdate } from '@peertube/peertube-models'

@Injectable()
export class UserAdminService {
  private authHttp = inject(HttpClient)
  private restExtractor = inject(RestExtractor)
  private restService = inject(RestService)
  private serverService = inject(ServerService)

  addUser (userCreate: UserCreate) {
    return this.authHttp.post(UserService.BASE_USERS_URL, userCreate)
      .pipe(catchError(err => this.restExtractor.handleError(err)))
  }

  updateUser (userId: number, userUpdate: UserUpdate) {
    return this.authHttp.put(UserService.BASE_USERS_URL + userId, userUpdate)
      .pipe(catchError(err => this.restExtractor.handleError(err)))
  }

  updateUsers (users: UserServerModel[], userUpdate: UserUpdate) {
    return from(users)
      .pipe(
        concatMap(u => this.authHttp.put(UserService.BASE_USERS_URL + u.id, userUpdate)),
        toArray(),
        catchError(err => this.restExtractor.handleError(err))
      )
  }

  getUsers (parameters: {
    pagination: RestPagination
    sort: SortMeta
    search?: string
  }): Observable<ResultList<UserServerModel>> {
    const { pagination, sort, search } = parameters

    let params = new HttpParams()
    params = this.restService.addRestGetParams(params, pagination, sort)

    if (search) {
      const filters = this.restService.parseQueryStringFilter(search, {
        blocked: {
          prefix: 'banned:',
          isBoolean: true
        }
      })

      params = this.restService.addObjectParams(params, filters)
    }

    return this.authHttp.get<ResultList<UserServerModel>>(UserService.BASE_USERS_URL, { params })
      .pipe(
        switchMap(data => {
          return this.serverService.getServerLocale()
            .pipe(map(translations => ({ data, translations })))
        }),
        map(({ data, translations }) => {
          return this.restExtractor.applyToResultListData(data, this.formatUser.bind(this), [ translations ])
        }),
        catchError(err => this.restExtractor.handleError(err))
      )
  }

  removeUsers (usersArg: UserServerModel | UserServerModel[]) {
    const users = arrayify(usersArg)

    return from(users)
      .pipe(
        concatMap(u => this.authHttp.delete(UserService.BASE_USERS_URL + u.id)),
        toArray(),
        catchError(err => this.restExtractor.handleError(err))
      )
  }

  banUsers (usersArg: UserServerModel | UserServerModel[], reason?: string) {
    const body = reason ? { reason } : {}
    const users = arrayify(usersArg)

    return from(users)
      .pipe(
        concatMap(u => this.authHttp.post(UserService.BASE_USERS_URL + u.id + '/block', body)),
        toArray(),
        catchError(err => this.restExtractor.handleError(err))
      )
  }

  unbanUsers (usersArg: UserServerModel | UserServerModel[]) {
    const users = arrayify(usersArg)

    return from(users)
      .pipe(
        concatMap(u => this.authHttp.post(UserService.BASE_USERS_URL + u.id + '/unblock', {})),
        toArray(),
        catchError(err => this.restExtractor.handleError(err))
      )
  }

  private formatUser (user: UserServerModel, translations: { [id: string]: string } = {}) {
    let videoQuota
    if (user.videoQuota === -1) {
      videoQuota = '∞'
    } else {
      videoQuota = getBytes(user.videoQuota, 0)
    }

    const videoQuotaUsed = getBytes(user.videoQuotaUsed, 0)

    let videoQuotaDaily: string
    let videoQuotaUsedDaily: string
    if (user.videoQuotaDaily === -1) {
      videoQuotaDaily = '∞'
      videoQuotaUsedDaily = getBytes(0, 0) + ''
    } else {
      videoQuotaDaily = getBytes(user.videoQuotaDaily, 0) + ''
      videoQuotaUsedDaily = getBytes(user.videoQuotaUsedDaily || 0, 0) + ''
    }

    return Object.assign(user, {
      role: {
        id: user.role.id,
        label: peertubeTranslate(user.role.label, translations)
      },
      videoQuota,
      videoQuotaUsed,
      rawVideoQuota: user.videoQuota,
      rawVideoQuotaUsed: user.videoQuotaUsed,
      videoQuotaDaily,
      videoQuotaUsedDaily,
      rawVideoQuotaDaily: user.videoQuotaDaily,
      rawVideoQuotaUsedDaily: user.videoQuotaUsedDaily
    })
  }
}
