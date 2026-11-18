const products = [
  {
    asin: 'B0H8BX5WRF',
    linkId: '7b8a390445764dda717eae043a63f48f',
    title: 'アンコール 1ポケットカードファイル',
    image: '81aKSTWsmML._AC_SX569_.jpg',
  },
  {
    asin: 'B0HNY6ZFWM',
    linkId: '5be7392efe53dc67c19a3d60c0852ac5',
    title: 'アイカツ！ Wariふぉと！ BOX',
    image: '61fzZdR8d5L._AC_SX679_.jpg',
  },
  {
    asin: 'B0HNJ5QK3D',
    linkId: 'd45627826f44df5045950b295951a1f8',
    title: 'アイカツフォン アンコール（特典付き）',
    image: '81b2u8HqU1L._AC_SX300_SY300_QL70_ML2_.jpg',
  },
  {
    asin: 'B0H615VF1G',
    linkId: 'a2ecfdae3ff6f7a12f5154d9b7bfbc08',
    title: 'アイカツ！ シールウエハース2 BOX',
    image: '81c5Ngse0KL._AC_SX342_SY445_QL70_ML2_.jpg',
  },
  {
    asin: 'B0HFR9N9KR',
    linkId: '4e0b12d20d6bcdb89010dbe692ef831d',
    title: 'バトスピ スタンダードステージ！',
    image: '71daZ-MUBoL._AC_SX679_.jpg',
  },
  {
    asin: 'B0HFQYXGR6',
    linkId: '979a3976ceae95e18c62853504bb0ed6',
    title: 'バトスピ 新たなる煌めき BOX',
    image: '71daZ-MUBoL._AC_SX679_.jpg',
  },
];

const imageBase = 'https://m.media-amazon.com/images/W/BW_MEDIAX_AVIF_MEASUREMENT_1306696-T4/images/I/';

export function pickAffiliateProduct(previousAsin, random = Math.random) {
  const candidates = products.length > 1 ? products.filter(product => product.asin !== previousAsin) : products;
  const product = candidates[Math.floor(random() * candidates.length)];
  if (!product) return null;

  const url = new URL(`https://www.amazon.co.jp/dp/${product.asin}`);
  url.search = new URLSearchParams({ linkCode: 'll2', tag: 'mczd-22', linkId: product.linkId, ref_: 'as_li_ss_tl' });
  return { asin: product.asin, title: product.title, url: url.href, imageUrl: imageBase + product.image };
}
