import { ListKeyManager } from '@angular/cdk/a11y'
import { NgFor, NgIf } from '@angular/common'
import { AfterViewChecked, Component, Injector, OnDestroy, OnInit, inject, viewChildren } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Params, Router } from '@angular/router'
import { AuthService, ServerService } from '@app/core'
import { HTMLServerConfig, SearchTargetType } from '@peertube/peertube-models'
import { logger } from '@root-helpers/logger'
import debug from 'debug'
import { of } from 'rxjs'
import { first, tap } from 'rxjs/operators'
import { GlobalIconComponent } from '../shared/shared-icons/global-icon.component'
import { SuggestionComponent, SuggestionPayload, SuggestionPayloadType } from './suggestion.component'

const debugLogger = debug('peertube:search')

@Component({
  selector: 'my-search-typeahead',
  templateUrl: './search-typeahead.component.html',
  styleUrls: [ './search-typeahead.component.scss' ],
  imports: [ FormsModule, GlobalIconComponent, NgFor, SuggestionComponent, NgIf ]
})
export class SearchTypeaheadComponent implements OnInit, AfterViewChecked, OnDestroy {
  private authService = inject(AuthService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private serverService = inject(ServerService)
  private injector = inject(Injector)

  readonly suggestionItems = viewChildren(SuggestionComponent)

  hasChannel = false
  inChannel = false
  areSuggestionsOpened = true

  search = ''
  serverConfig: HTMLServerConfig

  inThisChannelText: string

  keyboardEventsManager: ListKeyManager<SuggestionComponent>
  results: SuggestionPayload[] = []

  activeSearch: SuggestionPayloadType

  private scheduleKeyboardEventsInit = false

  ngOnInit () {
    this.route.queryParams
      .pipe(first(params => this.isOnSearch() && params.search !== undefined && params.search !== null))
      .subscribe(params => this.search = params.search)

    this.serverConfig = this.serverService.getHTMLConfig()
    this.computeTypeahead()

    this.serverService.configReloaded
      .subscribe(config => {
        this.serverConfig = config
        this.computeTypeahead()
      })
  }

  ngAfterViewChecked () {
    if (this.scheduleKeyboardEventsInit && !this.keyboardEventsManager) {
      // Avoid ExpressionChangedAfterItHasBeenCheckedError errors
      setTimeout(() => this.initKeyboardEventsManager(), 0)
    }
  }

  ngOnDestroy () {
    if (this.keyboardEventsManager) this.keyboardEventsManager.change.unsubscribe()
  }

  showSearchGlobalHelp () {
    return this.search && this.areSuggestionsOpened && this.keyboardEventsManager?.activeItem?.result()?.type === 'search-index'
  }

  canSearchAnyURI () {
    return this.authService.isLoggedIn()
      ? this.serverConfig.search.remoteUri.users
      : this.serverConfig.search.remoteUri.anonymous
  }

  onSearchChange () {
    this.computeTypeahead()
  }

  initKeyboardEventsManager () {
    if (this.keyboardEventsManager) return

    this.keyboardEventsManager = new ListKeyManager(this.suggestionItems, this.injector)

    const activeIndex = this.suggestionItems().findIndex(i => i.result().default === true)
    if (activeIndex === -1) {
      logger.error('Cannot find active index.', { suggestionItems: this.suggestionItems() })
    }

    this.updateItemsState(activeIndex)

    this.keyboardEventsManager.change.subscribe(
      _ => this.updateItemsState()
    )
  }

  computeTypeahead () {
    const searchIndexConfig = this.serverConfig.search.searchIndex

    if (!this.activeSearch) {
      if (searchIndexConfig.enabled && (searchIndexConfig.isDefaultSearch || searchIndexConfig.disableLocalSearch)) {
        this.activeSearch = 'search-index'
      } else {
        this.activeSearch = 'search-instance'
      }
    }

    this.areSuggestionsOpened = true
    this.results = []

    if (!this.search) return

    if (searchIndexConfig.enabled === false || searchIndexConfig.disableLocalSearch !== true) {
      this.results.push({
        text: this.search,
        type: 'search-instance',
        default: this.activeSearch === 'search-instance'
      })
    }

    if (searchIndexConfig.enabled) {
      this.results.push({
        text: this.search,
        type: 'search-index',
        default: this.activeSearch === 'search-index'
      })
    }

    this.scheduleKeyboardEventsInit = true

    debugLogger('Typeahead rebuilt', this.results)
  }

  updateItemsState (index?: number) {
    if (!this.keyboardEventsManager) return

    if (index !== undefined) {
      this.keyboardEventsManager.setActiveItem(index)
    }

    for (const item of this.suggestionItems()) {
      if (this.keyboardEventsManager.activeItem && this.keyboardEventsManager.activeItem === item) {
        item.active = true
        this.activeSearch = item.result().type
        continue
      }

      item.active = false
    }
  }

  onSuggestionClicked (payload: SuggestionPayload) {
    this.doSearch(this.buildSearchTarget(payload))
  }

  onSuggestionHover (index: number) {
    this.updateItemsState(index)
  }

  handleKey (event: KeyboardEvent) {
    if (!this.keyboardEventsManager) return

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.stopPropagation()

        this.keyboardEventsManager.onKeydown(event)
        break

      case 'Enter':
        event.stopPropagation()
        this.doSearch()
        break
    }
  }

  isOnSearch () {
    return window.location.pathname === '/search'
  }

  doSearch (searchTarget?: SearchTargetType) {
    this.areSuggestionsOpened = false
    const queryParams: Params = {}

    if (this.isOnSearch() && this.route.snapshot.queryParams) {
      Object.assign(queryParams, this.route.snapshot.queryParams)
    }

    if (!searchTarget) {
      searchTarget = this.buildSearchTarget(this.keyboardEventsManager.activeItem.result())
    }

    Object.assign(queryParams, { search: this.search, searchTarget })

    const o = this.authService.isLoggedIn()
      ? this.loadUserLanguagesIfNeeded(queryParams)
      : of(true)

    o.subscribe(() => this.router.navigate([ '/search' ], { queryParams }))
  }

  private loadUserLanguagesIfNeeded (queryParams: any) {
    if (queryParams?.languageOneOf) return of(queryParams)

    return this.authService.userInformationLoaded
      .pipe(
        first(),
        tap(() => Object.assign(queryParams, { languageOneOf: this.authService.getUser().videoLanguages }))
      )
  }

  private buildSearchTarget (result: SuggestionPayload): SearchTargetType {
    if (result.type === 'search-index') {
      return 'search-index'
    }

    return 'local'
  }
}
