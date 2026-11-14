// Static images from the repo's asset library (monorepo root /assets). Metro watches the workspace root.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro resolves static images through require() */
export const images = {
  welcomeHero: require('../../../assets/avatar-stickers/webp512/amaka_08_wave.webp'),
} as const;
