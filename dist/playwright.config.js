import { defineConfig } from '@playwright/test';
export default defineConfig({
    use: {
        viewport: { width: 1280, height: 720 },
    },
});
