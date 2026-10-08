// 別サイトの公開URLを設定したビルドで、相互リンクを表示する。
const link = document.getElementById('related-site');
const destination = import.meta.env.VITE_RELATED_SITE_URL?.trim();
if (link && destination) {
  try {
    const url = new URL(destination);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
      link.href = url.href;
      link.hidden = false;
    }
  } catch { /* URL未設定・不正の場合はリンクを表示しない。 */ }
}
