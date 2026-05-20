// AikatsuKibun (アイカツ！気分) インタラクティブ・ロジック (V3 超強化版)
// YouTube動画連携、150曲選曲、お気に入り、再生履歴、おまかせ選曲、タイプ自動判別、シンセサイザーSE

import beatmapData from './beatmap_fYibOFCMpnE.json';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 150曲以上の動画IDデータベース ---
    const initialVideoIds = [
        'tsKd6HdXvso', 'RjGv7Sa4YQo', '4z31xQuGTp4', '3qqJ1WpF1Cg', 'uISk1HrbFzA', 'q5d60AsaN98', 'Wy_pD0JgHR4',
        '2BN2jH1zlUA', 'bBYYGWyi_Ig', 'aKPhl4S91mM', 'ZCEXyMPKWhA', '7fJuYvx3ou0', '2t0vIcfvEeY', 'uPVjCDbc-Ow',
        'uRcy4Aj4B8w', 'BZqKDdCoTZM', 'HcHpQ_qj6WQ', 'en95U1lK2EQ', 'LQa1mIGbV1c', '72xB_012eVY', '3gVFHFm9Gxw',
        'xiXCHkBaOCg', 'ZbgdnKbyFSo', 'BoE8mVhNjO0', '6beo8GHes4U', '4H4ID0eHREE', 'jmKak1vq1Go', 'Ogu6EGNumKI',
        'N1W9IzcJ8Ug', 'pYT8w_qP6ro', 'gVw3xo5Uf-8', 'KLLJJIs9_7s', 'KATAtxUEEy4', 'RVZCWJ8XuhI', 'sRfanR9ZZ0U',
        'iXr5sT3PFKg', 'NmZm5YQf8l0', 'GlgVZ5Z76-M', '1wMEC1WZLts', 'qs4FOgqvTj0', 'lHrI8DmPCac', 'ULY7WX4_Sd8',
        'MpffoNUUGx8', 'KkPGFKp0gXA', 'pJEKdGGQXdo', '_yyszvUE4r8', 'FPSmZacW_UA', 'hwuuwNyRcKI', '-Xh9NYCRw0M',
        '9w_utuMvfOc', 'SvFOQobTzk0', 'xhBY87NDwrE', '6IEVhN5zJC0', 'VxQ4wn8cGyA', 'op0UXD2l55g', 'oj9dwIkLI_4',
        'oTME3Ur1-ak', 'w2DOYY1mFrg', 'clq4pdBCtTY', '5u5Nc1UWXgg', 'RuKpbA9RSGw', 'M4r1vx2ofUQ', 'AEMsMi7n5x8',
        'BKdhQ8GTjbU', 'n8cEgbNzGPc', 'lODsTsWgyg4', 'cNrttb3MPlY', '0GxDua-0G98', '-YAB0CUxkPE', 'Pu0wYH4CU4E',
        'cwZBNZkF4UQ', 'ujWIfR_rwIg', 'x2Po_BZM_uI', 'tezg1gSJbdo', 'VLIHkj5TrlY', 'PdOakkv6I1w', 'KBWyBfdYy5w',
        'EpSXZjzrUkg', 'OUj4Q8qx1ZQ', '1meOdSe6XTQ', 'Vh2KJq-lyLk', '5dRbGrDWIOU', '4SR6G0eoDPs', '1Jy-KfZwCeA',
        'jIRuoBkjltc', 'UNwx5x2NM9A', 'wDcemF2c3Ro', 'M73DLRbfn_c', '2pAT2OBDXXk', 'yp8Jhjt_png', 'fcPc573QgjU',
        'EOAzGVIzo7U', 'S3bGcj2Rm5o', 'rqqKNukafX0', 'EShAj8OeknA', 'tRx-ayAnRXA', 'p3lVBD4ei6k', 'WLnv4MwbumM',
        'F8V90FkxIZU', 'qpjQ6ZmhDCo', 'nC7OrqXYc6k', 'huFkGmp6eaw', 'cEO4Z7lq-q8', 'LzlDy5edLzo', 'IoK9hnz8cOs',
        '4wEIAGRAxHw', '1xwXyuePSak', 'ql5bm1VU7oQ', 'RfwQteCBfYw', 'fMz6hOoGHHU', 'XzezA5Icqoo', 'WO9D0IKmnX0',
        '9f6_hQtkQsA', '9JQFov6GazM', '8wKDBiD4XsA', 'uXhyoPjNmaw', 'iqRMeq9ajZE', 'fxBWfBLLlU', 'XTSgskSDKEw',
        'WkcqB18K60c', 'TrTFIr8f-n0', 'NLi86WxjPvs', 'MXOBWa1DLCw', 'tfAep2L872E', 'itWdwzWn0Sk', 'z8_cmTbrlNw',
        'xE_Z_Ph7fYk', 'wfqZHr40e0k', 'uepx-pu_IOI', 'r3ZOW5AQRis', 'oo6cucd8FGY', 'mNCv-dmYPS8', 'ltcZaHcarug',
        'h0kOl31dJoM', 'fXluHhS6IGQ', 'f9eRf6ccrAs', 'bWDAyRa6rGU', 'a86i2NFElAk', 'TX414PPKQTA', 'QqJs_d5PWzw',
        'KsORl3_jgMQ', 'KIKPbfhYxPY', 'ItzPBWP614E', 'I8rX7mfQd90', 'HvtKsOu48JU', 'GtXHDzYyCA', 'DjraTjOS0c4',
        'BDu-c8m3Elo', '9-ITMd0_Hmc', '3lFpoJyNmSs', '3ULbpMIz32w', 'Q1zHZ_5WoQo', 'm0FGgFsMpNc', 'K2uy7wGFFgw',
        '1x9rWKtrn9Y', 'Vnobd_FDp48', 'H5miyoLIaGk', 'ZLIqln6BSGI', 'Oqepld-YRaE', 'i_NnjpotJ5M', '5r3snDugV8M',
        'zv7he_TKHpg', 'q2tjrV2JiZY', 'kibfnTlnKBs', 'hihAM-CQyzM', 'cYstuM4CYsU', 'mkdEmQ5RttE', 'XO_2jNhCqTw',
        'VWrSZ8BjIyA', 'KbYs5YYUK7I', '2ZNxFC--4fE', 'qJ3YJ4eywvY', '1vYteBXaOyI', 'lsFTKcP9EyA', 'bz6ejOvk2_U',
        'vHnENRwluK0', 'htnIF4hkZ40', 'lZ_3EU7X3yA', 'PUR0XbH4LrQ', 'Foyc6FTiRnA', 'oz9aqDD7F_c', 'uOSDgSH_T80',
        '22vPY_1OaLY', 'J_1DFaELLPU', 'THoRA3aT4og', 'SYEqF_FY5Qo', '_Vdv7jMZzQ', 'LW9ho4Ftjh8', 'sLtVMfyuQfk',
        'AyNw00TNrCA', 'cvArV6EOysI', 'm3zcqWEBrI4', 'YPxyfDqAmYU', 'o545mbzprw4', 'O5BisaR_30Y', 'FyG3JM9_Ga0',
        'BaMR9ZcA8NU', 'AiWGcDOnFhM', 'o3IYLSbYac4', 'cvy9ts-rNTE', 'KS83f4N0pwU', 'CJUtJQ1rzg4', 'slnfBIWMni4',
        'WdpK14OXYB4', '0sZE4i8Y7k4', 'hF6YDrfCqbQ', 'dYVD26j9ZSc', 'bu5dmV11-ok', 'bh3QyscC4z4', '4KtjvHTq5jY',
        'nGpwaZusSmc', '6uduAQx_HKA', 'KRYSa79bbQE', 'Pd1Z0wX93cE', 'zOuIiDw9K_A', 'c7HeTKiV4-Y', 'tDv6rkHgV9k',
        'FAf3MKuOgGE', 'nSQYIQA6rB8', 'hUc05yg7RYM', 'dirjw0TRnJE', 'WKsfqws2NOs', 'VwZ0bzDVIMo', 'zQSZpeuS3x0',
        'SxR-zqtIg0A', 'CQYcrKCjxlI', 'wKtiP2V9yr0', 'o7JY84_bMHQ', 'sZbyRDGAOD0', 'kl6mUw3zIbE', 'A32dkTeVQwA',
        'z8ay9dAhyFg', '862yM3gCsuY', 'IOVtbv7ZEjU', 'Tn6mOEL1zJ0', 'wctOLFXwRg4', 'wPiw_E_1WBg', '9TJg8_FtCOQ',
        'vyvXYaF0a04', 'Wsr3K2GZfys', 'RYmw8Et5riA', '3iy5PjmSPNM', 'sO7NArY8qhw', 'fGdLUtMch5c', 'j9nIpp9l99w',
        'e86X5ipmG9U', 'imVC38JopIU', 'R1TEBqAnkMU', 'MwvlyT0O9xE', 'xzss0RaYK18', 'xHvKyrvQhu8', 'c8SNAvOvOOM',
        'vg8EntypJ8c', 'cMQAbcUz20g', 'dUMxFQeFFbI', 'wZWiZD4etXI', 'r9fnpDxkCH8', 'vKRBn9de308', 'd7AWyGroqxk',
        'De3tjz6BhHY', 'ByG2m8Rxx60', 'yh5nPYJR2Es', 'DC0YU_-t0y4', 'LqD2vAtHy10', 'B7DyC125qks', 'DMhXbYkz4FQ',
        '4ZGQMqSWKfw', 'bpmWBZqPl_U', '0hJperuzZ_M', 'xcsQsXU6Rj8', 'B6l3x2XrK6w', '0t0VGl6uu5k', 'lHVf_1O4AII',
        'RbyZQyiFFco', 'LMEzfV068a4', 'pn8YwQlJuyU', '-hyVsOSSPbw', '22wYlpKWqC8', 'nwuC2NSyixg', 'km0hHCZp5RY',
        'hropvmRz0_M', 'uWvlOqpAbMM', 'xb639LdgDpw', '4wignYcpqe8', 'RJTrTeEObog', 'xh_360kVOF4', 'PMpfH86vnNM',
        'EvIyzjlyH_0', 'B8tgwNoJ_8A', 'oUNR-I5V8rQ', 'b4xLiGq72AM', 'SEL5D6ya14M', '2qfgRuoMpcE', 'plFa4paRLdA',
        'ceCioX0LYU0', 'vPWL8vYPHNM', '2hYr422h1wo', 'YLn9COaWyog', 'mAwLMgpSBAQ', 'VqZUUQ0KVqw', 'S3twekqjVQc',
        'rQ19M5WXmbA', 'ixRp65POU7k', 'NzpBaiboVYU', '_5Y_mEzAOvI', 'rqt-LlEloKk', 'DEdbmXWokTI', 'VmL9z7AhPMQ',
        'UoEO_tK53ck', 'UXByUTuzQso', 'RuKpbA9RSGw', 'tZ-p6ff8s0Y', 'T460dxv4sNA', 'fQ2OExJkSjI'
    ];

    // --- 2. 要素の取得 ---
    const appContainer = document.getElementById('app');
    const youtubePlayer = document.getElementById('youtube-player');
    const sparkleContainer = document.getElementById('sparkle-container');

    // コントロールボタン
    const ctrlShuffle = document.getElementById('ctrl-shuffle');
    const ctrlSelect = document.getElementById('ctrl-select');
    const ctrlFavorites = document.getElementById('ctrl-favorites');
    const ctrlHistory = document.getElementById('ctrl-history');
    const ctrlAdd = document.getElementById('ctrl-add');
    const ctrlHelp = document.getElementById('ctrl-help');

    // モーダル・オーバーレイ
    const modalOverlay = document.getElementById('modal-overlay');
    const modalHelp = document.getElementById('modal-help');
    const modalSelect = document.getElementById('modal-select');
    const modalFavorites = document.getElementById('modal-favorites');
    const modalHistory = document.getElementById('modal-history');
    const modalAdd = document.getElementById('modal-add');

    // モーダル内部要素
    const videoSearchInput = document.getElementById('video-search-input');
    const videoListContainer = document.getElementById('video-list-container');
    const favoriteListContainer = document.getElementById('favorite-list-container');
    const historyListContainer = document.getElementById('history-list-container');
    const addVideoUrlInput = document.getElementById('add-video-url');
    const btnAddSubmit = document.getElementById('btn-add-submit');
    const addVideoError = document.getElementById('add-video-error');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const btnClearFavorites = document.getElementById('btn-clear-favorites');

    const buttons = {
        'btn-red': document.getElementById('btn-red'),
        'btn-green': document.getElementById('btn-green'),
        'btn-yellow': document.getElementById('btn-yellow')
    };

    // 👥 ユーザー投稿譜面共有システム関連のDOM
    const editGenerationSelect = document.getElementById('edit-generation-select');
    const editShareDbBtn = document.getElementById('edit-share-db-btn');
    const modalShare = document.getElementById('modal-share');
    const shareAuthorName = document.getElementById('share-author-name');
    const shareBeatmapTitle = document.getElementById('share-beatmap-title');
    const btnShareSubmit = document.getElementById('btn-share-submit');
    const shareStatusMessage = document.getElementById('share-status-message');



    // --- 3. 状態管理 (State) ---
    let currentVideoId = 'fYibOFCMpnE';
    let currentTheme = 'theme-cool';
    let currentSparkleEmoji = '✦';
    let ytPlayer = null; // YouTube Player API インスタンス
    let isApiReady = false;

    // 🎬 開発者エディター専用の状態管理
    let isEditorMode = false;
    let isRecording = false;
    let tempBeatmap = []; // 編集・レコーディング中のテンポラリ配列
    let timelineZoom = 1.0; // タイムラインの表示倍率
    const BASE_PIXELS_PER_SECOND = 40; // 1秒あたりの基準ピクセル幅 (ズーム1.0x)

    // --- 3.5 リズムゲーム用状態変数と同期・判定ロジック ---
    const scoreVal = document.getElementById('score-val');
    const comboVal = document.getElementById('combo-val');
    const gameContainer = document.getElementById('game-container');
    const laneNotesContainer = document.getElementById('lane-notes-container');
    const judgementDisplay = document.getElementById('judgement-display');
    const noBeatmapGuide = document.getElementById('no-beatmap-guide');

    // 🎬 エディター用DOM要素
    const ctrlEditor = document.getElementById('ctrl-editor');
    const editorPanel = document.getElementById('editor-panel');
    const editRecBtn = document.getElementById('edit-rec-btn');
    const editClearBtn = document.getElementById('edit-clear-btn');
    const editPlayTestBtn = document.getElementById('edit-play-test-btn');
    const recStatusVal = document.getElementById('rec-status-val');
    const editorNotesCount = document.getElementById('editor-notes-count');

    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetValEl = document.getElementById('offset-val');

    // ⏳ タイムライン用DOM要素
    const timelineContainer = document.getElementById('timeline-container');
    const timelineTrack = document.getElementById('timeline-track');
    const timelinePlayhead = document.getElementById('timeline-playhead');
    const timelineTicks = document.getElementById('timeline-ticks');
    const timelineNotes = document.getElementById('timeline-notes');
    const tlZoomIn = document.getElementById('tl-zoom-in');
    const tlZoomOut = document.getElementById('tl-zoom-out');
    const tlZoomVal = document.getElementById('tl-zoom-val');

    let hasBeatmap = false;
    let rawBeatmap = [];      // 全ノーツデータ
    let activeNotes = [];     // 判定待ちノーツ
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let animationFrameId = null;

    // 高精度スクロール用タイムスタンプ補正
    let lastTimeUpdate = performance.now();
    let lastPlayerTime = 0;

    // 動画と譜面のタイミング同期用オフセット (秒単位) - エディタで可変にするためletに変更
    let BEATMAP_OFFSET = -0.15;

    const getSmoothCurrentTime = () => {
        if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return 0;
        if (ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
            return ytPlayer.getCurrentTime();
        }
        const playerTime = ytPlayer.getCurrentTime();
        const now = performance.now();
        if (playerTime !== lastPlayerTime) {
            lastPlayerTime = playerTime;
            lastTimeUpdate = now;
        }
        const elapsed = (now - lastTimeUpdate) / 1000;
        return playerTime + elapsed;
    };

    const startRhythmGameLoop = () => {
        const NOTE_SPEED = 180; // スクロール速度 (px/sec)
        const JUDGE_LINE_X = 60; // 判定ライン X座標

        const updateLoop = () => {
            if (!hasBeatmap || !ytPlayer || typeof ytPlayer.getPlayerState !== 'function') {
                animationFrameId = requestAnimationFrame(updateLoop);
                return;
            }

            const currentTime = getSmoothCurrentTime();

            // 🎬 エディター用：タイムライン再生ヘッドの同期
            if (isEditorMode) {
                updateTimelinePlayhead(currentTime);
            }

            activeNotes.forEach(note => {
                if (isEditorMode && note.state === 'hit') return;

                const timeDiff = (note.time + BEATMAP_OFFSET) - currentTime;

                if (isEditorMode) {
                    // --- 🎬 エディターモード中の描画挙動 ---
                    if (!note.element && timeDiff <= 3.0 && timeDiff >= -0.5) {
                        const noteEl = document.createElement('div');
                        noteEl.className = `lane-note ${note.type}`;
                        laneNotesContainer.appendChild(noteEl);
                        note.element = noteEl;
                    }

                    if (note.element) {
                        if (timeDiff < -0.5 || timeDiff > 3.0) {
                            note.element.remove();
                            note.element = null;
                        } else {
                            const x = JUDGE_LINE_X + timeDiff * NOTE_SPEED;
                            note.element.style.left = `${x}px`;
                        }
                    }
                    // エディタ中はactiveを維持して逆方向シーク時に再描画できるようにする
                    note.state = 'active';
                } else {
                    // --- 🎮 通常プレイ時の描画＆判定挙動 ---
                    if (note.state !== 'active') return;

                    if (!note.element && timeDiff <= 3.0 && timeDiff >= -0.5) {
                        const noteEl = document.createElement('div');
                        noteEl.className = `lane-note ${note.type}`;
                        laneNotesContainer.appendChild(noteEl);
                        note.element = noteEl;
                    }

                    if (note.element) {
                        if (timeDiff < -0.3) {
                            note.state = 'miss';
                            note.element.remove();
                            note.element = null;
                            triggerJudgement('MISS');
                        } else {
                            const x = JUDGE_LINE_X + timeDiff * NOTE_SPEED;
                            note.element.style.left = `${x}px`;
                        }
                    }
                }
            });

            if (!isEditorMode) {
                // 通常プレイ時のみアクティブなものだけにフィルタリング
                activeNotes = activeNotes.filter(note => note.state === 'active');
            }

            animationFrameId = requestAnimationFrame(updateLoop);
        };
        animationFrameId = requestAnimationFrame(updateLoop);
    };

    const triggerJudgement = (status) => {
        if (!judgementDisplay) return;

        judgementDisplay.textContent = status;
        judgementDisplay.className = `judgement-display pop judge-${status.toLowerCase()}`;

        // CSSアニメーションのリセットと再発火
        judgementDisplay.style.animation = 'none';
        judgementDisplay.offsetHeight; // リフロー発生
        judgementDisplay.style.animation = '';

        if (status === 'MISS') {
            combo = 0;
        } else {
            combo++;
            if (combo > maxCombo) maxCombo = combo;

            let points = 0;
            if (status === 'PERFECT') points = 1000;
            else if (status === 'GREAT') points = 500;
            else if (status === 'GOOD') points = 200;

            score += points;
        }

        if (comboVal) comboVal.textContent = combo;
        if (scoreVal) scoreVal.textContent = String(score).padStart(6, '0');
    };

    const checkHit = (btnId) => {
        const colorMap = {
            'btn-red': 'red',
            'btn-green': 'green',
            'btn-yellow': 'yellow'
        };
        const expectedColor = colorMap[btnId];
        if (!expectedColor) return;

        const currentTime = getSmoothCurrentTime();

        let closestNote = null;
        let minDiff = Infinity;

        // 最も時間的に近いノーツを探索
        activeNotes.forEach(note => {
            if (note.state !== 'active' || note.type !== expectedColor) return;
            const diff = Math.abs((note.time + BEATMAP_OFFSET) - currentTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestNote = note;
            }
        });

        // 300ms 以内なら判定適用
        if (closestNote && minDiff <= 0.3) {
            closestNote.state = 'hit';
            if (closestNote.element) {
                closestNote.element.remove();
                closestNote.element = null;
            }

            if (minDiff <= 0.10) {
                triggerJudgement('PERFECT');
            } else if (minDiff <= 0.20) {
                triggerJudgement('GREAT');
            } else {
                triggerJudgement('GOOD');
            }
        }
    };

    // 🎬 エディターUIとJSON表示の更新
    const updateEditorUI = () => {
        if (editorNotesCount) editorNotesCount.textContent = tempBeatmap.length;

        // ⏳ タイムラインのノーツを描画
        drawTimelineNotes();
    };

    // ⏳ タイムライン：目盛り ticks 描画
    const drawTimelineTicks = () => {
        if (!timelineTicks || !ytPlayer || typeof ytPlayer.getDuration !== 'function') return;
        timelineTicks.innerHTML = '';
        
        const duration = ytPlayer.getDuration() || 180;
        const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
        const trackWidth = duration * pps;
        if (timelineTrack) timelineTrack.style.width = `${trackWidth}px`;

        let step = 1;
        if (timelineZoom < 0.75) step = 2;
        if (timelineZoom < 0.4) step = 5;
        if (timelineZoom < 0.2) step = 10;
        
        for (let sec = 0; sec <= duration; sec += step) {
            const x = sec * pps;
            const isMajor = sec % 5 === 0;

            const tickLine = document.createElement('div');
            tickLine.className = `timeline-tick-line ${isMajor ? 'major' : ''}`;
            tickLine.style.left = `${x}px`;
            timelineTicks.appendChild(tickLine);

            if (isMajor) {
                const label = document.createElement('div');
                label.className = 'timeline-tick-label';
                label.style.left = `${x}px`;
                
                const m = Math.floor(sec / 60);
                const s = String(sec % 60).padStart(2, '0');
                label.textContent = `${m}:${s}`;
                timelineTicks.appendChild(label);
            }
        }
    };

    // ⏳ タイムライン：ノーツピンの描画
    const drawTimelineNotes = () => {
        if (!timelineNotes) return;
        timelineNotes.innerHTML = '';

        const pps = BASE_PIXELS_PER_SECOND * timelineZoom;

        tempBeatmap.forEach((note) => {
            const x = note.time * pps;
            const pin = document.createElement('div');
            pin.className = `timeline-note-pin type-${note.type}`;
            pin.style.left = `${x}px`;
            pin.title = `${note.type}ノーツ: ${note.time.toFixed(3)}秒`;

            // ピンクリック時にピンポイント削除
            pin.addEventListener('click', (e) => {
                e.stopPropagation(); // タイムラインのシークを防ぐ
                
                // 削除処理
                tempBeatmap = tempBeatmap.filter(n => n.beat_index !== note.beat_index);
                tempBeatmap.sort((a, b) => a.time - b.time);
                tempBeatmap.forEach((n, idx) => n.beat_index = idx + 1);

                // 同期
                rawBeatmap = tempBeatmap;
                activeNotes = rawBeatmap.map(n => ({
                    ...n,
                    element: null,
                    state: 'active'
                }));

                if (tempBeatmap.length === 0) {
                    if (noBeatmapGuide) noBeatmapGuide.classList.remove('hidden');
                }

                updateEditorUI();
            });

            timelineNotes.appendChild(pin);
        });
    };

    // ⏳ タイムライン：再生ヘッド位置更新＆自動スクロール
    const updateTimelinePlayhead = (currentTime) => {
        if (!timelinePlayhead) return;
        const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
        const x = currentTime * pps;
        timelinePlayhead.style.left = `${x}px`;

        if (isEditorMode && timelineContainer) {
            const containerWidth = timelineContainer.clientWidth;
            const scrollLeft = timelineContainer.scrollLeft;
            
            // ヘッドが右側70%を超えたらスクロール
            if (x > scrollLeft + containerWidth * 0.7) {
                timelineContainer.scrollLeft = x - containerWidth * 0.3;
            } else if (x < scrollLeft) {
                timelineContainer.scrollLeft = x - containerWidth * 0.3;
            }
        }
    };

    const initRhythmGame = (videoId) => {
        score = 0;
        combo = 0;
        if (scoreVal) scoreVal.textContent = '000000';
        if (comboVal) comboVal.textContent = '0';
        if (judgementDisplay) {
            judgementDisplay.className = 'judgement-display';
            judgementDisplay.textContent = '';
        }
        if (laneNotesContainer) laneNotesContainer.innerHTML = '';
        if (noBeatmapGuide) noBeatmapGuide.classList.add('hidden');

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // 1. デフォルト曲のみビルトイン譜面をデフォルトロード（非同期でサーバー最新が取得されるまでのプレースホルダー）
        let loadedBeatmap = [];
        if (videoId === 'fYibOFCMpnE') {
            loadedBeatmap = beatmapData.beatmap || [];
            hasBeatmap = true;
        } else {
            hasBeatmap = false;
        }

        if (hasBeatmap) {
            rawBeatmap = loadedBeatmap;
            activeNotes = rawBeatmap.map(note => ({
                ...note,
                element: null,
                state: 'active'
            }));

            if (gameContainer) gameContainer.classList.remove('hidden');
            startRhythmGameLoop();
        } else {
            rawBeatmap = [];
            activeNotes = [];
            // エディット可能にするためにレーンは表示し続ける
            if (gameContainer) gameContainer.classList.remove('hidden');
            if (noBeatmapGuide) noBeatmapGuide.classList.remove('hidden');
        }

        // 編集中のテンポラリ配列を最新データに同期
        tempBeatmap = JSON.parse(JSON.stringify(rawBeatmap));
        updateEditorUI();

        // 👥 サーバーからこの動画用の共有譜面一覧を非同期で取得
        fetchSharedBeatmaps(videoId);
    };

    // 👥 共有譜面データをロードしてゲーム＆エディタに反映するヘルパー
    const loadSharedBeatmapData = (selected) => {
        console.log("👥 loadSharedBeatmapData called. selected data:", selected);
        score = 0;
        combo = 0;
        if (scoreVal) scoreVal.textContent = '000000';
        if (comboVal) comboVal.textContent = '0';
        if (laneNotesContainer) laneNotesContainer.innerHTML = '';
        if (noBeatmapGuide) {
            console.log("👥 Hiding noBeatmapGuide element");
            noBeatmapGuide.classList.add('hidden');
        }
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        rawBeatmap = selected.beatmap_data || [];
        console.log("👥 rawBeatmap notes count:", rawBeatmap.length);
        activeNotes = rawBeatmap.map(note => ({
            ...note,
            element: null,
            state: 'active'
        }));
        hasBeatmap = rawBeatmap.length > 0;
        
        if (hasBeatmap) {
            console.log("👥 Launching rhythm game loop...");
            if (gameContainer) gameContainer.classList.remove('hidden');
            startRhythmGameLoop();
        } else {
            console.warn("👥 rawBeatmap is empty, game loop will not start");
        }
        
        // エディタ側を同期
        tempBeatmap = JSON.parse(JSON.stringify(rawBeatmap));
        updateEditorUI();
    };

    // 👥 サーバーから投稿された譜面を取得して自動適用＆エディタ世代リストを更新
    const fetchSharedBeatmaps = async (videoId) => {
        console.log("👥 fetchSharedBeatmaps triggered for videoId:", videoId);
        if (!editGenerationSelect) {
            console.warn("👥 editGenerationSelect DOM element not found, skipping fetch!");
            return;
        }
        
        // 世代選択肢をクリア
        editGenerationSelect.innerHTML = '<option value="">🎵 最新の公開譜面 (自動適用中)</option>';
        
        try {
            console.log("👥 Fetching from API: /api/get-beatmaps?video_id=" + videoId);
            const response = await fetch(`/api/get-beatmaps?video_id=${videoId}`);
            console.log("👥 Fetch response status:", response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log("👥 Fetched data array:", data);
                if (data && data.length > 0) {
                    // キャッシュに保存
                    window.sharedBeatmapsCache = data;
                    
                    // 最新1件を自動適用
                    const latestBeatmap = data[0];
                    console.log("👥 Auto-loading the latest beatmap:", latestBeatmap);
                    loadSharedBeatmapData(latestBeatmap);
                    
                    // 世代選択肢に追加
                    data.forEach((bm, index) => {
                        const option = document.createElement('option');
                        option.value = bm.id;
                        const timeStr = new Date(bm.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                        const titleSuffix = bm.title ? ` [${bm.title}]` : '';
                        option.textContent = `${index === 0 ? '🆕 最新 ' : ''}(${timeStr}) 作成者: ${bm.author}${titleSuffix}`;
                        editGenerationSelect.appendChild(option);
                    });
                    console.log("👥 editGenerationSelect updated with " + data.length + " generations.");
                } else {
                    console.log("👥 No shared beatmaps found in database for this video.");
                    window.sharedBeatmapsCache = [];
                }
            } else {
                console.error("👥 API request failed with status:", response.status);
            }
        } catch (e) {
            console.error("👥 Shared beatmaps fetch error:", e);
        }
    };

    // LocalStorageから配列を読み込み
    let favoriteIds = JSON.parse(localStorage.getItem('fav_ids') || '[]');
    let historyIds = JSON.parse(localStorage.getItem('hist_ids') || '[]');
    let customVideos = JSON.parse(localStorage.getItem('custom_videos') || '[]'); // ユーザー追加動画データ

    // キャッシュ済みの動画詳細データ { id: { id, title, thumbnailUrl } }
    let videoCache = {};

    // --- 4. Web Audio API 音響シンセサイザー ---
    let audioCtx = null;
    let noiseBuffer = null;

    const initAudioContext = () => {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    };

    const getNoiseBuffer = () => {
        if (!noiseBuffer && audioCtx) {
            const bufferSize = audioCtx.sampleRate * 0.15;
            noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return noiseBuffer;
    };

    const playTapSound = () => {
        initAudioContext();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;

        // 1. 太鼓成分 (三角波)
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
        oscGain.gain.setValueAtTime(0.35, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);

        // 2. 鈴/タンバリン成分 (ノイズ + ハイパスフィルタ)
        const currentNoiseBuffer = getNoiseBuffer();
        if (currentNoiseBuffer) {
            const actualSource = audioCtx.createBufferSource();
            actualSource.buffer = currentNoiseBuffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6500, now);
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            actualSource.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            actualSource.start(now);
            actualSource.stop(now + 0.12);
        }
    };

    // --- 5. パーティクルエフェクト ---
    const createSparkleParticles = (btn) => {
        if (!sparkleContainer) return;
        const rect = btn.getBoundingClientRect();
        const containerRect = sparkleContainer.getBoundingClientRect();
        const centerX = rect.left - containerRect.left + rect.width / 2;
        const centerY = rect.top - containerRect.top + rect.height / 2;

        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
            const star = document.createElement('span');
            star.className = 'sparkle';
            star.textContent = currentSparkleEmoji;
            star.style.left = `${centerX}px`;
            star.style.top = `${centerY}px`;

            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 80;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance - 20;
            const rot = 180 + Math.random() * 360;

            star.style.setProperty('--tx', `${tx}px`);
            star.style.setProperty('--ty', `${ty}px`);
            star.style.setProperty('--rot', `${rot}deg`);

            sparkleContainer.appendChild(star);
            setTimeout(() => star.remove(), 600);
        }
    };

    const triggerButton = (btnId) => {
        const btn = buttons[btnId];
        if (!btn) return;
        if (navigator.vibrate) navigator.vibrate(15);
        playTapSound();
        createSparkleParticles(btn);

        const colorMap = { 'btn-red': 'red', 'btn-green': 'green', 'btn-yellow': 'yellow' };
        const noteColor = colorMap[btnId];

        // 🎬 エディターモードかつレコーディング中のリアルタイム録音
        if (isEditorMode && isRecording && noteColor) {
            const time = parseFloat((getSmoothCurrentTime()).toFixed(3));
            
            // デフォルト位置 (赤:中央, 緑:左下, 黄:右下)
            const defPosMap = {
                'red': [320, 150],
                'green': [160, 240],
                'yellow': [480, 240]
            };
            const pos = defPosMap[noteColor] || [320, 180];

            tempBeatmap.push({
                beat_index: tempBeatmap.length + 1,
                time: time,
                type: noteColor,
                intensity: 150,
                detected_pos: pos
            });

            tempBeatmap.sort((a, b) => a.time - b.time);
            tempBeatmap.forEach((n, idx) => n.beat_index = idx + 1);

            rawBeatmap = tempBeatmap;
            activeNotes = rawBeatmap.map(note => ({
                ...note,
                element: null,
                state: 'active'
            }));
            hasBeatmap = true;
            if (noBeatmapGuide) noBeatmapGuide.classList.add('hidden');

            updateEditorUI();
            return;
        }

        // リズムゲーム判定
        if (hasBeatmap && !isEditorMode) {
            checkHit(btnId);
        }
    };

    // --- 6. イベントリスナー登録 (ボタン操作系) ---
    Object.keys(buttons).forEach(btnId => {
        const btn = buttons[btnId];
        if (!btn) return;

        const activate = (e) => {
            e.preventDefault();
            initAudioContext();
            btn.classList.add('active');
            triggerButton(btnId);
        };
        const deactivate = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
        };

        btn.addEventListener('touchstart', activate, { passive: false });
        btn.addEventListener('touchend', deactivate, { passive: false });
        btn.addEventListener('touchcancel', deactivate, { passive: false });
        btn.addEventListener('mousedown', (e) => {
            initAudioContext();
            btn.classList.add('active');
            triggerButton(btnId);
        });
        btn.addEventListener('mouseup', () => btn.classList.remove('active'));
        btn.addEventListener('mouseleave', () => btn.classList.remove('active'));
    });

    // キーボード操作
    const keyMap = { 'w': 'btn-red', 'a': 'btn-green', 'd': 'btn-yellow' };
    document.addEventListener('keydown', (e) => {
        // エディターモード時のSpaceキーでの再生・一時停止トグル
        if (isEditorMode && e.code === 'Space') {
            const activeEl = document.activeElement;
            const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (!isInputActive) {
                e.preventDefault(); // 画面スクロール防止
                if (ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
                    const state = ytPlayer.getPlayerState();
                    if (state === YT.PlayerState.PLAYING) {
                        ytPlayer.pauseVideo();
                    } else {
                        ytPlayer.playVideo();
                    }
                }
                return;
            }
        }

        const btnId = keyMap[e.key.toLowerCase()];
        if (btnId) {
            const btn = buttons[btnId];
            if (btn && !btn.classList.contains('active')) {
                initAudioContext();
                btn.classList.add('active');
                triggerButton(btnId);
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        const btnId = keyMap[e.key.toLowerCase()];
        if (btnId) {
            const btn = buttons[btnId];
            if (btn) btn.classList.remove('active');
        }
    });

    // --- 7. YouTubeプレイヤー連携＆テーマ変更処理 ---
    const applyTheme = (themeName) => {
        const themes = ['theme-cool', 'theme-sexy', 'theme-cute', 'theme-pop'];
        themes.forEach(t => appContainer.classList.remove(t));
        appContainer.classList.add(themeName);
        currentTheme = themeName;

        // テーマごとのエフェクト絵文字設定
        if (themeName === 'theme-cute') currentSparkleEmoji = '♥';
        else if (themeName === 'theme-pop') currentSparkleEmoji = '★';
        else if (themeName === 'theme-sexy') currentSparkleEmoji = '♦';
        else currentSparkleEmoji = '✦';
    };

    // 主要動画IDとテーマの直接マッピングテーブル（主要なプレイ動画のIDを正確に関連付け）
    const videoIdThemeMap = {
        // クールテーマ (theme-cool - ブルー系)
        'fYibOFCMpnE': 'theme-cool', // 硝子ドール (ユリカ - ※ユリカはクール)
        'RjGv7Sa4YQo': 'theme-cool', // Signalize! (いちご/美月 - ※クール寄り)
        'Wy_pD0JgHR4': 'theme-cool', // G線上のShining Sky
        '2BN2jH1zlUA': 'theme-cool', // Growing for a dream
        '7fJuYvx3ou0': 'theme-cool', // Dancing Baby
        '2t0vIcfvEeY': 'theme-cool', // チュチュ・バレリーナ
        'ltcZaHcarug': 'theme-cool', // タルト・タタン (スミレ)
        'bz6ejOvk2_U': 'theme-cool', // 永遠の灯 (ユリカ)
        'gtXHDzYyCA': 'theme-cool',  // prism spiral (あおい)
        'KsORl3_jgMQ': 'theme-cool', // 硝子ドール
        '3lFpoJyNmSs': 'theme-cool', // タルト・タタン
        
        // セクシーテーマ (theme-sexy - パープル系)
        'bBYYGWyi_Ig': 'theme-sexy', // Take Me Higher (美月/蘭/ユリカ - ※美月/蘭はセクシー)
        'HvtKsOu48JU': 'theme-sexy', // Moonlight destiny (美月)
        'lsFTKcP9EyA': 'theme-sexy', // Chica×Chica (珠璃/凛/まどか - ※情熱のセクシー)
        'vHnENRwluK0': 'theme-sexy', // 薄紅デイトリッパー (みやび - ※セクシー/和風)
        'AyNw00TNrCA': 'theme-sexy', // MY SHOWTIME! (凛 - ※クール/セクシー)
        'cvArV6EOysI': 'theme-sexy', // 魅惑の九尾
        'I8rX7mfQd90': 'theme-sexy', // Trap of Love (蘭)
        
        // キュートテーマ (theme-cute - ピンク系)
        'BDu-c8m3Elo': 'theme-cute', // アイドル活動！ (Rock)
        'tsKd6HdXvso': 'theme-cute', // アイドル活動！ (いちご)
        '3qqJ1WpF1Cg': 'theme-cute', // カレンダーガール (いちご/あおい/蘭)
        'uISk1HrbFzA': 'theme-cute', // ヒラリ/ヒトリ/キラリ (STAR☆ANIS)
        'aKPhl4S91mM': 'theme-cute', // ハッピィクレッシェンド
        'KATAtxUEEy4': 'theme-cute', // Du-Du-Wa DO IT!! (あかり)
        'ULY7WX4_Sd8': 'theme-cute', // 恋するみたいなキャラメリゼ
        'pJEKdGGQXdo': 'theme-cute', // 桜色花伝 (さくら)
        '9w_utuMvfOc': 'theme-cute', // チュチュ・バレリーナ (スミレ/凛 - ※Cute/Cool)
        'cwZBNZkF4UQ': 'theme-cute', // 笑顔のSuncatcher
        'UNwx5x2NM9A': 'theme-cute', // Pretty Pretty
        'S3bGcj2Rm5o': 'theme-cute', // Lovely Party Collection
        'WLnv4MwbumM': 'theme-cute', // スタートライン！
        'WO9D0IKmnX0': 'theme-cute', // 始まりの伝説
        'TrTFIr8f-n0': 'theme-cute', // ハートのメロディ
        'NLi86WxjPvs': 'theme-cute', // オリジナルスター☆彡
        'vPWL8vYPHNM': 'theme-cute', // キラリ☆パーティータイム
        '3gVFHFm9Gxw': 'theme-cute', // カレンダーガール
        'xiXCHkBaOCg': 'theme-cute', // カレンダーガール
        
        // ポップテーマ (theme-pop - イエロー系)
        'e9LkFKbRoq4': 'theme-pop',  // ダイヤモンドハッピー
        '4z31xQuGTp4': 'theme-pop',  // ダイヤモンドハッピー (いちご/あおい/蘭)
        'q5d60AsaN98': 'theme-pop',  // Angel Snow (おとめ)
        'ZCEXyMPKWhA': 'theme-pop',  // オトナモード (みくる)
        'sRfanR9ZZ0U': 'theme-pop',  // ハッピークレヨン (おとめ)
        'qs4FOgqvTj0': 'theme-pop',  // 放課後ポニーテール (しおん)
        'ujWIfR_rwIg': 'theme-pop',  // マジカルタイム (きい)
        'tezg1gSJbdo': 'theme-pop',  // KIRA☆Power (いちご/セイラ)
        'huFkGmp6eaw': 'theme-pop',  // ハローニューワールド (ひなき)
        'oz9aqDD7F_c': 'theme-pop',  // Poppin' Bubbles (ひなき/珠璃)
        'THoRA3aT4og': 'theme-pop',  // サマー☆マジック
        'bu5dmV11-ok': 'theme-pop',  // ミエルエール (みくる)
        'B8tgwNoJ_8A': 'theme-pop',  // 恋するみたいなキャラメリゼ
        'S3twekqjVQc': 'theme-pop'   // ドリームバルーン
    };

    // 曲のタイトル名とIDから、テーマカラーを決定する
    const detectTheme = (title, videoId) => {
        // 1. まず動画IDでのマッピングテーブルを最優先チェック
        if (videoIdThemeMap[videoId]) {
            return videoIdThemeMap[videoId];
        }

        const titleLower = title.toLowerCase();

        // 2. タイトルのキーワードから詳細に自動判定
        
        // --- キュート属性判定キーワード ---
        const cuteRegex = new RegExp([
            'キュート', 'cute', 'ピンク', 'pink', 'アイドル活動', 'カレンダーガール', 
            'いちご', 'あかり', 'マリア', 'さくら', 'のえる', 'まどか', 'ここね', 
            'エンジェリーシュガー', 'angely', 'ドリーミークラウン', 'crown',
            'オーロラファンタジー', 'aurora', 'スウィートスパイア', 'sweet spire', 
            'ハートのメロディ', 'pretty', 'スターライト', '始まりの伝説', 
            'オリジナルスター', 'フレンド', 'ハッピィクレッシェンド', 'Blooming'
        ].join('|'), 'i');

        // --- クール属性判定キーワード ---
        const coolRegex = new RegExp([
            'クール', 'cool', 'ブルー', 'blue', '青',
            'あおい', 'ユリカ', 'スミレ', 'セイラ', 'ロリゴシック', 'loli', 'goth',
            'フューチャリング', 'futuring', 'シャイニング', 'shining', 'prism', 'spiral',
            'シグナライズ', 'signalize', '永遠の灯'
        ].join('|'), 'i');

        // --- セクシー属性判定キーワード ---
        const sexyRegex = new RegExp([
            'セクシー', 'sexy', 'パープル', 'purple', 'マゼンタ', 'バイオレット', '紫',
            '美月', '蘭', '珠璃', 'みやび', '凛', 'エルザ', 'レイ', 'アリシア',
            'スパイシーアゲハ', 'spicy', 'サングリアロサ', 'sangria', 'ラブクイーン', 'love queen',
            'ラブムーンライズ', 'love moonrise', 'ロイヤルソード', 'royal sword',
            'trap of love', 'precious', 'デイトリッパー', 'flicker', 'destiny', 'higher', 'chica',
            'チュチュ', '薄紅', 'ダンシングディーヴァ'
        ].join('|'), 'i');

        // --- ポップ属性判定キーワード ---
        const popRegex = new RegExp([
            'ポップ', 'pop', 'イエロー', 'yellow', 'オレンジ', 'orange', 
            'おとめ', 'きい', 'ひなき', 'みくる', 'ゆず', 'ニーナ',
            'ハッピーレインボー', 'rainbow', 'マジカルトイ', 'toy', 'ヴィヴィッドキス', 'vivid', 'kiss', 
            'ダイヤモンド', 'ダイヤ', 'クレヨン', 'サマー', 'ミエル', 'オトナモード', 'ポニーテール',
            'マジカルタイム', 'kira☆power', 'ハッピークレヨン', 'bubbles'
        ].join('|'), 'i');

        if (cuteRegex.test(titleLower)) return 'theme-cute';
        if (coolRegex.test(titleLower)) return 'theme-cool';
        if (sexyRegex.test(titleLower)) return 'theme-sexy';
        if (popRegex.test(titleLower)) return 'theme-pop';

        // 3. 全てに引っかからない場合は、一貫性を保つため動画IDのハッシュ値から決定（毎回同じ曲は必ず同じテーマになる）
        let hash = 0;
        for (let i = 0; i < videoId.length; i++) {
            hash += videoId.charCodeAt(i);
        }
        const defaultThemes = ['theme-cute', 'theme-cool', 'theme-sexy', 'theme-pop'];
        return defaultThemes[hash % 4];
    };

    const playVideo = (videoId, skipHistory = false) => {
        currentVideoId = videoId;
        
        // YouTube APIによる高速動画切り替え（API準備完了時）
        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            // 選曲時は自動再生、音声あり(mute=0)
            ytPlayer.loadVideoById({
                videoId: videoId,
                startSeconds: 0
            });
            const overlay = document.getElementById('player-overlay');
            if (overlay) overlay.classList.remove('paused');
        } else {
            // API準備前のフォールバック（iframeを直接更新）
            const iframe = document.getElementById('youtube-player');
            if (iframe) {
                iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=0&controls=0`;
            }
        }

        // 履歴への追加
        if (!skipHistory) {
            historyIds = [videoId, ...historyIds.filter(id => id !== videoId)].slice(0, 30);
            localStorage.setItem('hist_ids', JSON.stringify(historyIds));
        }

        // キャッシュデータの取得とテーマ判定
        getVideoDetail(videoId).then(detail => {
            const theme = detectTheme(detail.title, videoId);
            applyTheme(theme);
        });

        // 譜面状態の初期化切り替え
        initRhythmGame(videoId);
    };

    // --- 8. NoEmbed APIによる非同期情報取得 ---
    const getVideoDetail = async (id) => {
        if (videoCache[id]) return videoCache[id];

        // デフォルト値
        const defaultData = {
            id: id,
            title: `アイカツ！動画 (ID: ${id})`,
            thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        };

        try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
            if (response.ok) {
                const data = await response.json();
                if (!data.error) {
                    const result = {
                        id: id,
                        title: data.title || defaultData.title,
                        thumbnailUrl: data.thumbnail_url || defaultData.thumbnailUrl
                    };
                    videoCache[id] = result;
                    return result;
                }
            }
        } catch (e) {
            console.error('NoEmbed fetch error:', e);
        }

        videoCache[id] = defaultData;
        return defaultData;
    };

    // --- 9. モーダルの挙動制御 ---
    const openModal = (modalElement) => {
        modalOverlay.classList.remove('hidden');
        modalElement.classList.remove('hidden');
    };

    const closeModal = () => {
        const modals = [modalHelp, modalSelect, modalFavorites, modalHistory, modalAdd, modalShare];
        modals.forEach(m => m.classList.add('hidden'));
        modalOverlay.classList.add('hidden');
    };

    // 閉じるボタンとオーバーレイにイベント登録
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    modalOverlay.addEventListener('click', closeModal);

    ctrlHelp.addEventListener('click', () => openModal(modalHelp));
    ctrlAdd.addEventListener('click', () => {
        addVideoError.classList.add('hidden');
        addVideoUrlInput.value = '';
        openModal(modalAdd);
    });

    // --- 10. 動画追加機能のロジック ---
    const extractVideoId = (url) => {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };

    btnAddSubmit.addEventListener('click', async () => {
        const url = addVideoUrlInput.value.trim();
        const id = extractVideoId(url);
        if (!id) {
            addVideoError.textContent = '❌ 有効なYouTube URLを入力してください。';
            addVideoError.classList.remove('hidden');
            return;
        }

        addVideoError.textContent = '取得中...';
        addVideoError.classList.remove('hidden');

        const detail = await getVideoDetail(id);
        
        // カスタム動画リストに保存
        if (!customVideos.some(v => v.id === id)) {
            customVideos = [detail, ...customVideos];
            localStorage.setItem('custom_videos', JSON.stringify(customVideos));
        }

        // お気に入りにも追加
        if (!favoriteIds.includes(id)) {
            favoriteIds = [id, ...favoriteIds];
            localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));
        }

        closeModal();
        playVideo(id);
    });

    // --- 11. リスト / お気に入り / 履歴 モーダルの中身動的生成 ---
    
    // リストアイテムDOM生成ヘルパー
    const createListItemDOM = (video, container, listType) => {
        const isFavorite = favoriteIds.includes(video.id);

        const li = document.createElement('li');
        li.className = 'item-card';

        const img = document.createElement('img');
        img.className = 'item-thumbnail';
        img.src = video.thumbnailUrl;
        img.alt = video.title;
        img.loading = 'lazy';

        const info = document.createElement('div');
        info.className = 'item-info';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'item-title';
        titleSpan.textContent = video.title;
        info.appendChild(titleSpan);

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const favBtn = document.createElement('button');
        favBtn.className = `fav-toggle-btn ${isFavorite ? 'is-favorite' : ''}`;
        favBtn.innerHTML = '★';
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(video.id, favBtn, listType);
        });

        actions.appendChild(favBtn);

        li.appendChild(img);
        li.appendChild(info);
        li.appendChild(actions);

        // クリックで再生
        li.addEventListener('click', () => {
            closeModal();
            playVideo(video.id);
        });

        container.appendChild(li);
    };

    // お気に入りのトグル処理
    const toggleFavorite = (id, buttonElement, sourceListType) => {
        if (favoriteIds.includes(id)) {
            favoriteIds = favoriteIds.filter(favId => favId !== id);
            buttonElement.classList.remove('is-favorite');
        } else {
            favoriteIds = [id, ...favoriteIds];
            buttonElement.classList.add('is-favorite');
        }
        localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));

        // モーダルが開かれている場合は再描画する
        if (sourceListType === 'fav' || !modalFavorites.classList.contains('hidden')) {
            renderFavorites();
        }
        if (sourceListType === 'select' || !modalSelect.classList.contains('hidden')) {
            renderVideoList();
        }
    };

    // 全動画リストモーダルの描画
    const renderVideoList = async () => {
        videoListContainer.innerHTML = '<li>読み込み中...</li>';

        // 全ID（デフォルト150曲 ＋ ユーザー追加分）のユニーク化
        const allIds = Array.from(new Set([...customVideos.map(v => v.id), ...initialVideoIds]));
        const filterText = videoSearchInput.value.trim().toLowerCase();

        videoListContainer.innerHTML = '';
        
        for (let id of allIds) {
            // キャッシュか初期データを取得
            let detail = videoCache[id] || customVideos.find(v => v.id === id);
            if (!detail) {
                // サムネイルを高速仮決定
                detail = {
                    id: id,
                    title: `動画 ID: ${id}`,
                    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
                };
            }

            if (filterText && !detail.title.toLowerCase().includes(filterText) && !detail.id.toLowerCase().includes(filterText)) {
                continue; // 検索フィルタ
            }

            createListItemDOM(detail, videoListContainer, 'select');

            // タイトルが仮のものの場合は裏で非同期フェッチして更新する
            if (!videoCache[id]) {
                getVideoDetail(id).then(updatedDetail => {
                    // 現在モーダルが開かれており、まだそのDOMがあるならタイトルを書き換える
                    const titleElements = videoListContainer.querySelectorAll('.item-title');
                    titleElements.forEach(el => {
                        if (el.textContent === detail.title) {
                            el.textContent = updatedDetail.title;
                        }
                    });
                });
            }
        }
    };

    // お気に入りリストモーダルの描画
    const renderFavorites = async () => {
        favoriteListContainer.innerHTML = '';
        if (favoriteIds.length === 0) {
            favoriteListContainer.innerHTML = '<li style="text-align:center;padding:20px;color:#aaa;">お気に入りはまだありません。</li>';
            return;
        }

        for (let id of favoriteIds) {
            const detail = await getVideoDetail(id);
            createListItemDOM(detail, favoriteListContainer, 'fav');
        }
    };

    // 再生履歴リストモーダルの描画
    const renderHistory = async () => {
        historyListContainer.innerHTML = '';
        if (historyIds.length === 0) {
            historyListContainer.innerHTML = '<li style="text-align:center;padding:20px;color:#aaa;">履歴はまだありません。</li>';
            return;
        }

        for (let id of historyIds) {
            const detail = await getVideoDetail(id);
            createListItemDOM(detail, historyListContainer, 'hist');
        }
    };

    // モーダルオープンボタンにレンダリング登録
    ctrlSelect.addEventListener('click', () => {
        videoSearchInput.value = '';
        renderVideoList();
        openModal(modalSelect);
    });

    videoSearchInput.addEventListener('input', renderVideoList);

    ctrlFavorites.addEventListener('click', () => {
        renderFavorites();
        openModal(modalFavorites);
    });

    ctrlHistory.addEventListener('click', () => {
        renderHistory();
        openModal(modalHistory);
    });

    // --- 12. データリセット処理 ---
    btnClearHistory.addEventListener('click', () => {
        if (confirm('再生履歴をすべて消去しますか？')) {
            historyIds = [];
            localStorage.setItem('hist_ids', JSON.stringify(historyIds));
            renderHistory();
        }
    });

    btnClearFavorites.addEventListener('click', () => {
        if (confirm('お気に入りをすべて消去しますか？')) {
            favoriteIds = [];
            localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));
            renderFavorites();
        }
    });

    // --- 13. おまかせ選曲 (☘️) ---
    ctrlShuffle.addEventListener('click', () => {
        const allIds = Array.from(new Set([...customVideos.map(v => v.id), ...initialVideoIds]));
        if (allIds.length === 0) return;

        let randomId = currentVideoId;
        // 同じ曲が連続で選ばれないようにループ（曲数が2以上の時）
        if (allIds.length > 1) {
            while (randomId === currentVideoId) {
                randomId = allIds[Math.floor(Math.random() * allIds.length)];
            }
        } else {
            randomId = allIds[0];
        }

        playVideo(randomId);
    });


    // --- 14. YouTube API 動的読み込み & 透明オーバーレイ制御 ---
    const initYouTubeAPI = () => {
        // すでにAPIが読み込み済み、またはインスタンスが存在する場合は即時実行
        if (window.YT && window.YT.Player) {
            window.onYouTubeIframeAPIReady();
            return;
        }

        // コールバック関数を確実にグローバル（window）に定義
        window.onYouTubeIframeAPIReady = () => {
            ytPlayer = new YT.Player('youtube-player', {
                videoId: currentVideoId,
                playerVars: {
                    autoplay: 0,       // 初回ロード時は自動再生しない
                    controls: 0,       // 下部コントロールバーを非表示にする
                    disablekb: 1,      // キーボード操作無効
                    fs: 0,             // 全画面表示非表示
                    modestbranding: 1, // YouTubeロゴ最小化
                    rel: 0,            // 関連動画非表示
                    showinfo: 0,       // タイトル等非表示
                    iv_load_policy: 3  // アノテーション非表示
                },
                events: {
                    onReady: (event) => {
                        isApiReady = true;
                    },
                    onStateChange: (event) => {
                        const overlay = document.getElementById('player-overlay');
                        if (!overlay) return;
                        
                        if (event.data === YT.PlayerState.PLAYING) {
                            overlay.classList.remove('paused');
                            // ⏳ タイムライン：再生開始時に目盛りを再構築 (時間幅の同期)
                            if (isEditorMode) {
                                drawTimelineTicks();
                                drawTimelineNotes();
                            }
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            overlay.classList.add('paused');
                            // ⏳ タイムライン：一時停止時も目盛りとノーツを更新
                            if (isEditorMode) {
                                drawTimelineTicks();
                                drawTimelineNotes();
                            }
                        } else if (event.data === YT.PlayerState.ENDED) {
                            overlay.classList.add('paused');
                        }
                    }
                }
            });
        };

        // スクリプトタグを動的に生成し、確実にコールバック定義後に挿入・開始させる
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
            document.head.appendChild(tag);
        }
    };

    const setupPlayerOverlay = () => {
        const overlay = document.getElementById('player-overlay');
        if (!overlay) return;

        overlay.addEventListener('click', (e) => {
            if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;

            // --- エディターモード中のクリック処理 (再生/一時停止トグルのみ) ---
            if (isEditorMode) {
                const playerState = ytPlayer.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    ytPlayer.pauseVideo();
                } else {
                    ytPlayer.playVideo();
                }
                return;
            }

            // --- 通常プレイ時のクリック処理 (ポーズ / プレイ) ---
            const state = ytPlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                ytPlayer.pauseVideo();
                overlay.classList.add('paused');
            } else {
                ytPlayer.playVideo();
                overlay.classList.remove('paused');
            }
        });
    };

    // --- 🎬 開発者エディター用イベントハンドラーの一括登録 ---
    const setupEditorEvents = () => {
        const isPC = !('ontouchstart' in window) && window.innerWidth > 768;
        
        // PC環境でなければエディタ切り替えボタンは非表示
        if (ctrlEditor) {
            if (isPC) {
                ctrlEditor.classList.remove('hidden');
            } else {
                ctrlEditor.style.display = 'none';
            }
        }

        // 1. エディタモードのトグル切り替え
        if (ctrlEditor) {
            ctrlEditor.addEventListener('click', () => {
                isEditorMode = !isEditorMode;
                document.body.classList.toggle('editor-mode-active');
                
                if (isEditorMode) {
                    ctrlEditor.classList.add('active');
                    // 編集用テンポラリ配列を同期
                    tempBeatmap = JSON.parse(JSON.stringify(rawBeatmap));
                    updateEditorUI();
                    
                    // ⏳ タイムラインの初期描画を実行
                    setTimeout(() => {
                        drawTimelineTicks();
                        drawTimelineNotes();
                        updateTimelinePlayhead(getSmoothCurrentTime());
                    }, 100);
                } else {
                    ctrlEditor.classList.remove('active');
                    stopRecording();
                }
            });
        }

        // 2. 録音(REC)開始/停止
        const startRecording = () => {
            isRecording = true;
            if (editRecBtn) {
                editRecBtn.textContent = '⏹️ 録音停止';
                editRecBtn.classList.add('recording');
            }
            if (recStatusVal) {
                recStatusVal.textContent = '🔴 録音中';
                recStatusVal.style.color = '#ff3366';
            }
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer) videoContainer.classList.add('recording-active');

            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            }
        };

        const stopRecording = () => {
            isRecording = false;
            if (editRecBtn) {
                editRecBtn.textContent = '🔴 REC開始';
                editRecBtn.classList.remove('recording');
            }
            if (recStatusVal) {
                recStatusVal.textContent = '待機中';
                recStatusVal.style.color = '';
            }
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer) videoContainer.classList.remove('recording-active');
        };

        if (editRecBtn) {
            editRecBtn.addEventListener('click', () => {
                if (isRecording) {
                    stopRecording();
                } else {
                    startRecording();
                }
            });
        }

        // 3. 全クリア
        if (editClearBtn) {
            editClearBtn.addEventListener('click', () => {
                if (confirm('現在の譜面データをすべて消去しますか？（保存するまで元の譜面データは削除されません）')) {
                    tempBeatmap = [];
                    rawBeatmap = [];
                    activeNotes = [];
                    if (laneNotesContainer) laneNotesContainer.innerHTML = '';
                    updateEditorUI();
                }
            });
        }

        // 4. テストプレイ (編集中のテンポラリデータを直接適用して0秒再生)
        if (editPlayTestBtn) {
            editPlayTestBtn.addEventListener('click', () => {
                stopRecording();

                // 編集中の譜面を直接リズムゲームのデータに適用
                rawBeatmap = tempBeatmap;
                activeNotes = rawBeatmap.map(note => ({
                    ...note,
                    element: null,
                    state: 'active'
                }));

                // 描画エリアとゲームループ初期化
                if (laneNotesContainer) laneNotesContainer.innerHTML = '';
                if (gameContainer) gameContainer.classList.remove('hidden');
                
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                startRhythmGameLoop();

                if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    ytPlayer.seekTo(0, true);
                    ytPlayer.playVideo();
                }
            });
        }



        // 7. オフセット調整
        const updateOffsetDisplay = () => {
            if (offsetValEl) {
                offsetValEl.textContent = `${BEATMAP_OFFSET >= 0 ? '+' : ''}${BEATMAP_OFFSET.toFixed(2)}s`;
            }
        };

        if (offsetMinus) {
            offsetMinus.addEventListener('click', () => {
                BEATMAP_OFFSET = parseFloat((BEATMAP_OFFSET - 0.05).toFixed(2));
                updateOffsetDisplay();
            });
        }

        if (offsetPlus) {
            offsetPlus.addEventListener('click', () => {
                BEATMAP_OFFSET = parseFloat((BEATMAP_OFFSET + 0.05).toFixed(2));
                updateOffsetDisplay();
            });
        }

        // 初期表示を反映
        updateOffsetDisplay();

        // ⏳ タイムライン：シーククリック同期
        if (timelineTrack) {
            timelineTrack.addEventListener('click', (e) => {
                if (!ytPlayer || typeof ytPlayer.seekTo !== 'function' || typeof ytPlayer.getDuration !== 'function') return;
                
                const rect = timelineTrack.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
                
                let targetTime = clickX / pps;
                const duration = ytPlayer.getDuration();
                
                targetTime = Math.max(0, Math.min(duration, targetTime));
                
                ytPlayer.seekTo(targetTime, true);
                updateTimelinePlayhead(targetTime);
            });
        }

        // ⏳ タイムライン：ズームコントロール
        if (tlZoomIn) {
            tlZoomIn.addEventListener('click', () => {
                timelineZoom = parseFloat((timelineZoom + 0.25).toFixed(2));
                if (timelineZoom > 3.0) timelineZoom = 3.0;
                if (tlZoomVal) tlZoomVal.textContent = `${timelineZoom.toFixed(2)}x`;
                drawTimelineTicks();
                drawTimelineNotes();
                updateTimelinePlayhead(getSmoothCurrentTime());
            });
        }

        if (tlZoomOut) {
            tlZoomOut.addEventListener('click', () => {
                timelineZoom = parseFloat((timelineZoom - 0.25).toFixed(2));
                if (timelineZoom < 0.25) timelineZoom = 0.25;
                if (tlZoomVal) tlZoomVal.textContent = `${timelineZoom.toFixed(2)}x`;
                drawTimelineTicks();
                drawTimelineNotes();
                updateTimelinePlayhead(getSmoothCurrentTime());
            });
        }

        // 💾 譜面のローカル保存 (LocalStorage)
        if (editSaveBtn) {
            editSaveBtn.addEventListener('click', () => {
                localStorage.setItem('beatmap_' + currentVideoId, JSON.stringify({
                    metadata: {
                        source_video: `https://www.youtube.com/watch?v=${currentVideoId}`,
                        total_notes: tempBeatmap.length,
                        dynamic_target_tracking: true
                    },
                    beatmap: tempBeatmap
                }));

                const originalText = editSaveBtn.textContent;
                editSaveBtn.textContent = '✅ 保存完了！';
                editSaveBtn.style.background = '#33cc66';
                editSaveBtn.style.color = '#000';
                setTimeout(() => {
                    editSaveBtn.textContent = originalText;
                    editSaveBtn.style.background = '';
                    editSaveBtn.style.color = '';
                }, 1500);
            });
        }



        // 👥 サーバーへ公開モーダルの開閉＆アップロード
        if (editShareDbBtn) {
            editShareDbBtn.addEventListener('click', () => {
                if (tempBeatmap.length === 0) {
                    alert('❌ ノーツが1つも配置されていない譜面は公開できません。RECを開始するかクリックで配置してください。');
                    return;
                }
                
                // 状態表示をクリア
                if (shareStatusMessage) {
                    shareStatusMessage.classList.add('hidden');
                    shareStatusMessage.textContent = '';
                }
                
                // ローカルストレージから前回入力した作者名を復元
                if (shareAuthorName) {
                    shareAuthorName.value = localStorage.getItem('share_author_name') || '';
                }
                if (shareBeatmapTitle) {
                    shareBeatmapTitle.value = '';
                }
                
                // 共有モーダルを開く
                openModal(modalShare);
            });
        }

        if (btnShareSubmit) {
            btnShareSubmit.addEventListener('click', async () => {
                const authorName = shareAuthorName ? shareAuthorName.value.trim() : '';
                const beatmapTitle = shareBeatmapTitle ? shareBeatmapTitle.value.trim() : '';
                
                if (!authorName) {
                    if (shareStatusMessage) {
                        shareStatusMessage.textContent = '❌ ニックネームを入力してください。';
                        shareStatusMessage.classList.remove('hidden');
                        shareStatusMessage.style.color = '#ff3366';
                    }
                    return;
                }
                
                // 作者名を次回のために保存
                localStorage.setItem('share_author_name', authorName);
                
                if (shareStatusMessage) {
                    shareStatusMessage.textContent = '📤 アップロード中...';
                    shareStatusMessage.classList.remove('hidden');
                    shareStatusMessage.style.color = '#ffd700';
                }
                
                try {
                    const response = await fetch('/api/save-beatmap', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            video_id: currentVideoId,
                            author: authorName,
                            title: beatmapTitle,
                            beatmap_data: tempBeatmap
                        })
                    });
                    
                    if (response.ok) {
                        if (shareStatusMessage) {
                            shareStatusMessage.textContent = '🎉 公開が完了しました！';
                            shareStatusMessage.style.color = '#33cc66';
                        }
                        
                        // 数秒後にモーダルを閉じ、ドロップダウンを更新
                        setTimeout(() => {
                            closeModal();
                            // プルダウンを再取得して更新
                            fetchSharedBeatmaps(currentVideoId);
                        }, 1500);
                    } else {
                        const errData = await response.json();
                        throw new Error(errData.error || 'サーバーエラーが発生しました。');
                    }
                } catch (err) {
                    if (shareStatusMessage) {
                        shareStatusMessage.textContent = `❌ アップロード失敗: ${err.message}`;
                        shareStatusMessage.style.color = '#ff3366';
                    }
                }
            });
        }
    };

    // 初回ロード時の初期化
    applyTheme('theme-cool');
    setupPlayerOverlay();
    initYouTubeAPI(); // 動的読み込みと初期化の開始
    initRhythmGame(currentVideoId); // リズムゲームの初期起動
    setupEditorEvents(); // 🎬 開発者エディターイベントの登録
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });

    // 👥 世代切り替えイベントの登録
    if (editGenerationSelect) {
        editGenerationSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (!val) {
                // 空（最新の自動適用）
                if (window.sharedBeatmapsCache && window.sharedBeatmapsCache.length > 0) {
                    loadSharedBeatmapData(window.sharedBeatmapsCache[0]);
                } else {
                    // なければデフォルトに戻す
                    initRhythmGame(currentVideoId);
                }
                return;
            }
            
            // 指定されたIDの世代データをロード
            const selected = window.sharedBeatmapsCache?.find(bm => String(bm.id) === String(val));
            if (selected) {
                loadSharedBeatmapData(selected);
            }
        });
    }
});
