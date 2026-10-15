/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

declare const __BUILD_TIME__: string
declare const __APP_VERSION__: string
/** CHANGELOG.md, for What's new. */
declare const __CHANGELOG__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
