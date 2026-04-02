// タップ時の発光を制御するロジック

document.addEventListener('DOMContentLoaded', () => {
    // 3つのボタンを取得
    const buttons = [
      document.getElementById('btn-red'),
      document.getElementById('btn-green'),
      document.getElementById('btn-yellow')
    ];
  
    buttons.forEach(btn => {
      if (!btn) return;
  
      // タッチ開始 または マウスダウンで光る
      const activate = (e) => {
        e.preventDefault(); // デフォルト動作（スクロール等）を防止
        btn.classList.add('active');
      };
  
      // タッチ終了 または マウスアップ/リーブで元に戻る
      const deactivate = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
      };
  
      // スマートフォン用タッチイベント
      btn.addEventListener('touchstart', activate, { passive: false });
      btn.addEventListener('touchend', deactivate, { passive: false });
      btn.addEventListener('touchcancel', deactivate, { passive: false });
  
      // PC用マウスイベント
      btn.addEventListener('mousedown', activate);
      btn.addEventListener('mouseup', deactivate);
      btn.addEventListener('mouseleave', deactivate);
    });

    // PCキーボード操作 (W, A, D) 対応
    const keyMap = {
      'w': document.getElementById('btn-red'),
      'a': document.getElementById('btn-green'),
      'd': document.getElementById('btn-yellow')
    };

    document.addEventListener('keydown', (e) => {
      const btn = keyMap[e.key.toLowerCase()];
      if (btn && !btn.classList.contains('active')) {
        btn.classList.add('active');
      }
    });

    document.addEventListener('keyup', (e) => {
      const btn = keyMap[e.key.toLowerCase()];
      if (btn) {
        btn.classList.remove('active');
      }
    });
  });
