# Changelog

## [0.4.0](https://github.com/unoplat/setu/compare/v0.3.0...v0.4.0) (2026-11-08)


### Features

* **editor:** support all heading levels ([891f773](https://github.com/unoplat/setu/commit/891f773c8c24194056eda923a6e68f2e0645a650))
* **frontend:** add GitHub connection, project sync and task Issue UI ([faff18d](https://github.com/unoplat/setu/commit/faff18d8d94ea71df514913afa086fbfa732af24))
* **github:** improve repository selection and settings ([a825d68](https://github.com/unoplat/setu/commit/a825d680351cfc54863a61621a01a58bd23b1b26))
* **github:** rewrite Issue sync on deltas and sync comments ([0b902c6](https://github.com/unoplat/setu/commit/0b902c69706a3cba69616a4039e99bbbdb6ce5af))
* **github:** show GitHub author and link on synced comments ([a60b1bf](https://github.com/unoplat/setu/commit/a60b1bf56a5583db0b45ee815a1ef548697f4240))
* **github:** streamline issue synchronization ([60ebda4](https://github.com/unoplat/setu/commit/60ebda49498886d027f281f6562e7a82e1b518f6))
* **github:** sync Envision tasks with GitHub Issues ([db80051](https://github.com/unoplat/setu/commit/db800512886a0c54e31df25086bdb6409b035774))
* **settings:** organize settings into tabs ([b09ba29](https://github.com/unoplat/setu/commit/b09ba29b22ff7aefa0349ede6577be3ada609ab8))


### Bug Fixes

* **deps:** pin Hishel and sync locked dependencies in CI ([24441c2](https://github.com/unoplat/setu/commit/24441c28d8f9b65c5b6fe2d7c28b88319feca9d8))
* **github:** respect Frappe transaction boundaries ([38d8492](https://github.com/unoplat/setu/commit/38d8492e696c52e47804d92679a59e0b2076f4d4))
* **kanban:** constrain board height and scrolling ([19086a3](https://github.com/unoplat/setu/commit/19086a3b8f8d3a837c63b78235feeb8a1b16aeb1))


### Documentation

* **github:** add ADRs, plans and research for the GitHub integration ([2c801d3](https://github.com/unoplat/setu/commit/2c801d3c1f93d79b42d0670140029327f23f1b42))


### Code Refactoring

* **github:** add data model and link state for delta sync ([6c0ab93](https://github.com/unoplat/setu/commit/6c0ab93e5adad714f368427bbd394bae935526a7))
* **github:** remove per-task disconnect support ([bd2ae9c](https://github.com/unoplat/setu/commit/bd2ae9cc1478b7932d52bbbf25cf71f3f64023da))
* **github:** show delta sync state and retries in the UI ([15e70c3](https://github.com/unoplat/setu/commit/15e70c353d44745a19ec9dacd0fe80ffc4027404))

## [0.3.0](https://github.com/unoplat/setu/compare/v0.2.0...v0.3.0) (2026-10-19)


### Features

* **tasks:** add subtask creation and parent management ([404ce2e](https://github.com/unoplat/setu/commit/404ce2ea5522cb18a4eeaa8f24e683aaa9af3c08))
* **tasks:** let Envision tasks hold subtasks ([fe0af19](https://github.com/unoplat/setu/commit/fe0af194f5471eda465ff8b4950a305d0676f87a))

## [0.2.0](https://github.com/unoplat/setu/compare/v0.1.0...v0.2.0) (2026-10-19)


### Features

* **inbox:** add inbox API over Frappe notification logs ([d9dabca](https://github.com/unoplat/setu/commit/d9dabcac01429188b8dc3f4e074efaa5f909a126))
* **inbox:** add inbox page with live unread badge ([e5a6afa](https://github.com/unoplat/setu/commit/e5a6afa54bfb6c8f82f01ffe1d50b37f1afc5565))

## [0.1.0](https://github.com/unoplat/setu/compare/v0.0.4...v0.1.0) (2026-10-16)


### Features

* **tasks:** add filterable linked task tables ([6f22619](https://github.com/unoplat/setu/commit/6f22619db1b91694153733cdafe629bea9ed54b0))
* **tasks:** add linked task tables and improve layout ([f205fd5](https://github.com/unoplat/setu/commit/f205fd574dd535374bd1079a8c5d88b3122805b9))


### Bug Fixes

* **layout:** contain wide content within the app shell ([1de1cb0](https://github.com/unoplat/setu/commit/1de1cb0e2f47e477e6f450964fc9a5f4b667287a))
* **store:** avoid render-time nuqs ref mutations ([2f34c11](https://github.com/unoplat/setu/commit/2f34c116e860b54704f967bfebac276ba32dd0e0))
* **store:** preserve queued partial URL updates ([55ee3c9](https://github.com/unoplat/setu/commit/55ee3c906bbf6b880c28d3c51f6de4c266584ec5))


### Code Refactoring

* **ui:** adopt semantic typography tokens ([6c359e2](https://github.com/unoplat/setu/commit/6c359e273a439e65520afb199a4d1137e460a9e3))

## [0.0.4](https://github.com/unoplat/setu/compare/v0.0.3...v0.0.4) (2026-10-12)


### Bug Fixes

* **ui:** center select item content vertically ([f921d09](https://github.com/unoplat/setu/commit/f921d09bbad1860d85cf2002117f5aa52ae4c49b))
* **ui:** center select item content vertically ([69e734c](https://github.com/unoplat/setu/commit/69e734cb80fb88bb9a0a0f590ca162917016cd56))


### Code Refactoring

* **ui:** share app-owned frontend controls ([6346afc](https://github.com/unoplat/setu/commit/6346afcb4a323858915cba98f1a33459e3bf6b6d))
* **ui:** share app-owned frontend controls ([08e2379](https://github.com/unoplat/setu/commit/08e237971e9ae2b3ec6b2c3705ba1c9ac546db39))

## [0.0.3](https://github.com/unoplat/setu/compare/v0.0.2...v0.0.3) (2026-10-09)


### Bug Fixes

* **search:** keep Envision index and cached results fresh ([6bb1473](https://github.com/unoplat/setu/commit/6bb14739fa43b2b03ce69c285d0e3dd348eee5ce))
* **search:** translate reconciliation error messages ([3cc5066](https://github.com/unoplat/setu/commit/3cc5066ab8903f9ef3a79c79ad16eae7483cfec6))

## [0.0.2](https://github.com/unoplat/setu/compare/v0.0.1...v0.0.2) (2026-10-08)


### Bug Fixes

* **lint:** stop pre-commit exclude from skipping .github ([035e192](https://github.com/unoplat/setu/commit/035e19266f096bad0ced1beeec0825e172ab486d))
* **lint:** stop pre-commit exclude from skipping .github ([d8e100d](https://github.com/unoplat/setu/commit/d8e100db296d309180584aa3f79c27a83f1c0414))
