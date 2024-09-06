export const BASE_PATHNAME = location.pathname.startsWith('/doodlegrid/') ? '/doodlegrid/' : '/';
export const EDIT_REGEX = new RegExp(`${BASE_PATHNAME}(\\d+)$`);
