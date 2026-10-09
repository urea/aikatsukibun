import test from 'node:test';
import assert from 'node:assert/strict';
import { readYouTubeAuthor } from '../../Encore/youtube-author.js';

test('投稿者名とチャンネルURLの明示的なハンドルを取得する', () => {
  assert.deepEqual(readYouTubeAuthor({ author_name: 'けやき通りCh.', author_url: 'https://www.youtube.com/@Keyaki_st' }), { author: 'けやき通りCh.', authorHandle: '@Keyaki_st' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'cubewano', author_url: 'https://www.youtube.com/@cubewano4' }), { author: 'cubewano', authorHandle: '@cubewano4' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'oku', author_url: 'https://www.youtube.com/@%E7%82%8E%E4%B8%8A-c7c' }), { author: 'oku', authorHandle: '@炎上-c7c' });
  assert.deepEqual(readYouTubeAuthor({ author_name: ' 名前 ', author_url: 'https://youtube.com/@Mixed_Case/' }), { author: '名前', authorHandle: '@Mixed_Case' });
});

test('旧形式・偽装ホスト・不正URLからハンドルを推測しない', () => {
  for (const author_url of [undefined, '', 'invalid', 'https://www.youtube.com/channel/UC123456789', 'https://www.youtube.com/user/username', 'https://evil.test/@fake', 'https://youtube.com.evil.test/@fake', 'https://youtube.com@evil.test/@fake', 'https://user:password@youtube.com/@fake', 'ftp://youtube.com/@fake', 'https://youtube.com/@', 'https://youtube.com/@name/extra', 'https://youtube.com/@bad%2Fname', 'https://youtube.com/@bad%20name', 'https://youtube.com/@%ZZ']) {
    assert.deepEqual(readYouTubeAuthor({ author_name: '投稿者', author_url }), { author: '投稿者' });
  }
});

test('欠落した投稿者名を作らず、取得した名前の長さを保存上限に収める', () => {
  for (const value of [undefined, null, {}, { author_name: '' }, { author_name: ' \n ' }, { author_name: 42 }]) assert.deepEqual(readYouTubeAuthor(value), { author: '' });
  assert.deepEqual(readYouTubeAuthor({ author_name: 'あ'.repeat(201) }), { author: 'あ'.repeat(200) });
});
