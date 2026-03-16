import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    AutoImport({
      resolvers: [
        ElementPlusResolver(),        // 自动导入 ElMessage 等
        IconsResolver({ prefix: 'Icon' }) // 自动导入图标
      ]
    }),
    Components({
      resolvers: [
        ElementPlusResolver(),        // 自动注册 el-button 等
        IconsResolver({               // 自动注册 <i-ep-edit /> 等
          enabledCollections: ['ep']
        })
      ]
    }),
    Icons({ autoInstall: true })      // 图标自动安装
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
