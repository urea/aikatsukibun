import test from 'node:test';
import assert from 'node:assert/strict';
import { readYouTubeAuthor, normalizeAuthorUrl, getYouTubeAuthorVideosUrl } from '../../Encore/youtube-author.js';
import { normalizeCustomVideos, normalizeVideoMetadata } from '../../Encore/model.js';

test('投稿者名とチャンネルURLの明示的なハンドルを取得する', () => {
  assert.deepEqual(readYouTubeAuthor({ author_name: 'けやき通りCh.', author_url: 'https://www.youtube.com/@Keyaki_st' }), { author: 'けやき通りCh.', authorHandle: '@Keyaki_st' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'cubewano', author_url: 'https://www.youtube.com/@cubewano4' }), { author: 'cubewano', authorHandle: '@cubewano4' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'oku', author_url: 'https://www.youtube.com/@%E7%82%8E%E4%B8%8A-c7c' }), { author: 'oku', authorHandle: '@炎上-c7c' });
  assert.deepEqual(readYouTubeAuthor({ author_name: ' 名前 ', author_url: 'https://youtube.com/@Mixed_Case/' }), { author: '名前', authorHandle: '@Mixed_Case' });
});

test('偽装ホスト・不正URLからハンドルやチャンネルURLを推測しない', () => {
  for (const author_url of [undefined, '', 'invalid', 'https://evil.test/@fake', 'https://youtube.com.evil.test/@fake', 'https://youtube.com@evil.test/@fake', 'https://user:password@youtube.com/@fake', 'ftp://youtube.com/@fake', 'https://youtube.com/@', 'https://youtube.com/@name/extra', 'https://youtube.com/@bad%2Fname', 'https://youtube.com/@bad%20name', 'https://youtube.com/@%ZZ']) {
    assert.deepEqual(readYouTubeAuthor({ author_name: '投稿者', author_url }), { author: '投稿者' });
  }
});

test('旧channel・user形式は出典のURLを保存しハンドルを作らない', () => {
  for (const [author_url, authorUrl] of [
    ['https://www.youtube.com/channel/UC123456789', 'https://www.youtube.com/channel/UC123456789'],
    ['http://m.youtube.com/user/username/videos?view=0#top', 'https://www.youtube.com/user/username'],
  ]) assert.deepEqual(readYouTubeAuthor({ author_name: '投稿者', author_url }), { author: '投稿者', authorUrl });
  assert.deepEqual(readYouTubeAuthor({ author_name: '@名前をハンドルにしない' }), { author: '@名前をハンドルにしない' });
});

test('投稿者URLは固定HTTPSホストのchannel rootへ正規化する', () => {
  for (const [input, output] of [
    ['https://youtube.com/@Keyaki_st/videos/', 'https://www.youtube.com/@Keyaki_st'],
    ['http://m.youtube.com/@炎上-c7c/', 'https://www.youtube.com/@%E7%82%8E%E4%B8%8A-c7c'],
    ['https://www.youtube.com/channel/UCabc_123-456/videos?ignored=1', 'https://www.youtube.com/channel/UCabc_123-456'],
    ['https://www.youtube.com/user/旧ユーザー/videos', 'https://www.youtube.com/user/%E6%97%A7%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC'],
  ]) assert.equal(normalizeAuthorUrl(input), output);
  for (const value of [undefined, null, 42, '', 'javascript:alert(1)', 'https://youtube.com.evil.test/user/name', 'https://user:pass@youtube.com/user/name', 'https://youtube.com:1234/@name', 'https://youtube.com./@name', 'https://youtube.com/watch?v=123', 'https://youtube.com/c/name', 'https://youtube.com/channel/invalid', 'https://youtube.com/user/', 'https://youtube.com/user/name/community', 'https://youtube.com/@bad%5Cname', 'https://youtube.com/@bad%3Fname', 'https://youtube.com/@bad%23name', 'https://youtube.com/@bad%00name', 'https://youtube.com/@bad\nname', `https://youtube.com/@${'a'.repeat(200)}`]) assert.equal(normalizeAuthorUrl(value), '');
});

test('動画一覧リンクは明示ハンドルを安全な1segmentにし、ない場合は保存URLを使う', () => {
  assert.equal(getYouTubeAuthorVideosUrl({ authorHandle: '@hajime_araiso' }), 'https://www.youtube.com/@hajime_araiso/videos');
  assert.equal(getYouTubeAuthorVideosUrl({ authorHandle: '@炎上-c7c' }), 'https://www.youtube.com/@%E7%82%8E%E4%B8%8A-c7c/videos');
  assert.equal(getYouTubeAuthorVideosUrl({ authorHandle: '@literal%2Fname' }), 'https://www.youtube.com/@literal%252Fname/videos');
  assert.equal(getYouTubeAuthorVideosUrl({ authorUrl: 'http://m.youtube.com/user/oldname/videos' }), 'https://www.youtube.com/user/oldname/videos');
  assert.equal(getYouTubeAuthorVideosUrl({ authorHandle: '@bad/name', authorUrl: 'https://youtube.com/channel/UC123' }), 'https://www.youtube.com/channel/UC123/videos');
  for (const metadata of [undefined, null, {}, { author: '@hajime_araiso' }, { authorHandle: '@' }, { authorHandle: '@@fake' }, { authorHandle: '@bad name' }, { authorHandle: '@bad?name' }, { authorHandle: '@bad#name' }, { authorHandle: '@bad\\name' }, { authorHandle: '@\ud800' }, { authorHandle: '@\udfff' }, { authorUrl: 'https://evil.test/@fake' }]) assert.equal(getYouTubeAuthorVideosUrl(metadata), '');
});

test('安全な投稿者URLはキャッシュ・共有一覧の正規化後も残り、不正URLは除外する', () => {
  const video = { id: 'tJAcDG-eS-Q', title: '曲', author: '投稿者', authorUrl: 'http://m.youtube.com/channel/UC123/videos', revision: 'a'.repeat(32) };
  const normalized = { ...video, authorUrl: 'https://www.youtube.com/channel/UC123' };
  assert.deepEqual(normalizeCustomVideos(JSON.parse(JSON.stringify([video]))), [normalized]);
  assert.deepEqual(normalizeVideoMetadata({ author: '投稿者', authorUrl: 'https://evil.test/@fake' }), { author: '投稿者' });
});

test('欠落した投稿者名を作らず、取得した名前の長さを保存上限に収める', () => {
  for (const value of [undefined, null, {}, { author_name: '' }, { author_name: ' \n ' }, { author_name: 42 }]) assert.deepEqual(readYouTubeAuthor(value), { author: '' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'あ'.repeat(201) }), { author: 'あ'.repeat(200) });
});
