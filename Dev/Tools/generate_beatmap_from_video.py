import cv2
import numpy as np
import json
import argparse
import os
import subprocess

# 640x360 解像度におけるボタン（判定サークル）の初期座標（固定位置時）
DEFAULT_COORDINATES = {
    "yellow": (287, 203), # 左（黄色 ⇨）
    "red": (336, 203),    # 中（赤色 ⇧）
    "green": (385, 203)   # 右（緑色 ⇦）
}

ROI_RADIUS = 6           # 監視する矩形サイズ（13x13 ピクセル）
COOLDOWN_FRAMES = 6      # 多重検出防止クールダウン
THRESHOLD = 22.0          # 輝度（V値）の急激な変化（立ち上がり）の閾値
TEMPLATE_SIZE = 32       # テンプレート画像サイズ（32x32）
SEARCH_WINDOW = 120       # 探索ウィンドウサイズ（120x120）
MATCH_THRESHOLD = 0.50   # テンプレートマッチング類似度閾値

def download_video(url, output_path):
    """yt-dlp を使用して動画をダウンロードします"""
    print(f"Downloading video from URL: {url} -> {output_path}")
    cmd = [
        "yt-dlp",
        "-f", "best[ext=mp4]/mp4",
        url,
        "-o", output_path
    ]
    subprocess.run(cmd, check=True)
    print("Download completed.")

def extract_templates(video_path, coords):
    """動画の開始初期（約2.5秒時点）からサークルのテンプレート画像を切り出します"""
    print("Extracting templates from video...")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Error: Could not open video for template extraction.")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS)
    # 動画開始約2.5秒の位置へシーク（サークルが綺麗に出現し、静止しているタイミング）
    target_frame = int(fps * 2.5)
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("Error: Could not read frame at 2.5s.")
        return None
        
    # 640x360に標準化
    if frame.shape[1] != 640 or frame.shape[0] != 360:
        frame = cv2.resize(frame, (640, 360))
        
    templates = {}
    half = TEMPLATE_SIZE // 2
    
    # テンプレート保存用のディレクトリを作成
    os.makedirs(os.path.join("Dev", "Tools"), exist_ok=True)

    for color, (cx, cy) in coords.items():
        # 座標の境界制限
        x1 = max(0, cx - half)
        y1 = max(0, cy - half)
        x2 = min(640, cx + half)
        y2 = min(360, cy + half)
        
        template_img = frame[y1:y2, x1:x2]
        templates[color] = template_img
        
        # デバッグ用にローカルにテンプレートを保存
        template_path = os.path.join("Dev", "Tools", f"template_{color}.png")
        cv2.imwrite(template_path, template_img)
        print(f"Saved template: {template_path}")
        
    return templates

def analyze_video_with_tracking(video_path, coords, templates, threshold):
    """サークルをテンプレートマッチングで追跡しながら、発光タイミングを検出します"""
    print(f"Analyzing video with tracking: {video_path}")
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return None
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video stats: {fps} FPS, {total_frames} total frames.")
    
    # トラッキング用の初期座標
    curr_coords = {color: coords[color] for color in coords}
    
    # 状態管理変数
    prev_v = {color: 0.0 for color in coords}
    cooldown = {color: 0 for color in coords}
    beatmap = []
    
    half_t = TEMPLATE_SIZE // 2
    half_w = SEARCH_WINDOW // 2
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 640x360にリサイズ（解像度のブレを統一するため）
        if frame.shape[1] != 640 or frame.shape[0] != 360:
            frame = cv2.resize(frame, (640, 360))
            
        # HSVに変換して明度（V）のみを取り出す（発光変化検出用）
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        v_channel = hsv[:, :, 2]
        
        timestamp = frame_idx / fps
        
        for color, template in templates.items():
            # クールダウン処理
            if cooldown[color] > 0:
                cooldown[color] -= 1
                
            # トラッキング位置（前フレームの位置）
            last_x, last_y = curr_coords[color]
            
            # 探索ウィンドウ（探索領域）の切り出し
            wx1 = max(0, last_x - half_w)
            wy1 = max(0, last_y - half_w)
            wx2 = min(640, last_x + half_w)
            wy2 = min(360, last_y + half_w)
            
            # 探索ウィンドウが小さすぎる場合はマッチングを行わない
            if (wx2 - wx1) < TEMPLATE_SIZE or (wy2 - wy1) < TEMPLATE_SIZE:
                continue
                
            search_area = frame[wy1:wy2, wx1:wx2]
            
            # テンプレートマッチング実行
            res = cv2.matchTemplate(search_area, template, cv2.TM_CCOEFF_NORMED)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
            
            # 類似度が一定以上なら、その位置にサークルがあるとみなし、座標を更新
            if max_val >= MATCH_THRESHOLD:
                # 画面全体（640x360）における中心座標に逆換算
                cx = wx1 + max_loc[0] + half_t
                cy = wy1 + max_loc[1] + half_t
                curr_coords[color] = (cx, cy)
                
                # 判定エリア（ROI）の平均明度を取得
                # 座標が画面からはみ出さないようにクリッピング
                rx1 = max(0, cx - ROI_RADIUS)
                ry1 = max(0, cy - ROI_RADIUS)
                rx2 = min(640, cx + ROI_RADIUS + 1)
                ry2 = min(360, cy + ROI_RADIUS + 1)
                
                roi = v_channel[ry1:ry2, rx1:rx2]
                current_v = float(np.mean(roi))
                
                # 明度の時間差分
                diff = current_v - prev_v[color]
                
                # 立ち上がり検出
                if diff > threshold and cooldown[color] == 0:
                    # 動画開始直後のフェードイン誤検出防止
                    if frame_idx > int(fps * 1.5):
                        beatmap.append({
                            "beat_index": len(beatmap) + 1,
                            "time": round(timestamp, 3),
                            "type": color,
                            "intensity": round(diff, 2),
                            "detected_pos": [cx, cy]
                        })
                        print(f"[DETECTED] Time: {timestamp:.3f}s | Color: {color:<6} | Pos: ({cx}, {cy}) | Match: {max_val:.2f} | Diff: {diff:.2f}")
                        cooldown[color] = COOLDOWN_FRAMES
                
                prev_v[color] = current_v
            else:
                # 類似度が低すぎる（サークルが画面から消えた）場合
                # 座標は前フレームの位置を維持するが、発光判定は行わない
                # また、消滅中の明度履歴はリセットする（再出現時の急激な差分による誤検知を防ぐため）
                prev_v[color] = 0.0
                
        frame_idx += 1
        if frame_idx % 300 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")
            
    cap.release()
    return beatmap

def main():
    parser = argparse.ArgumentParser(description="Extract beatmap from Aikatsu play video with template tracking.")
    parser.add_argument("-u", "--url", help="YouTube video URL")
    parser.add_argument("-i", "--input", help="Local MP4 video path")
    parser.add_argument("-o", "--output", default=os.path.join("Dev", "Tools", "beatmap_output.json"), help="Output JSON path")
    parser.add_argument("-t", "--threshold", type=float, default=THRESHOLD, help="Brightness difference threshold")
    args = parser.parse_args()
    
    video_file = args.input
    
    # URL指定がある場合はダウンロードする
    if args.url:
        video_file = os.path.join("Dev", "Tools", "temp_download.mp4")
        download_video(args.url, video_file)
    elif not video_file:
        # デフォルトファイルを確認
        default_path = os.path.join("Dev", "Tools", "demo.mp4")
        if os.path.exists(default_path):
            video_file = default_path
        else:
            print("Error: No input video specified and default demo.mp4 not found.")
            return

    # テンプレートの自動切り出し
    templates = extract_templates(video_file, DEFAULT_COORDINATES)
    if not templates:
        print("Error: Could not extract templates. Aborting.")
        return

    # 解析実行（トラッキング機能付き）
    beatmap = analyze_video_with_tracking(video_file, DEFAULT_COORDINATES, templates, args.threshold)
    
    if beatmap is not None:
        output_data = {
            "metadata": {
                "source_video": video_file,
                "total_notes": len(beatmap),
                "threshold_used": args.threshold,
                "tracking": True
            },
            "beatmap": beatmap
        }
        
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
            
        print(f"\nProcessing finished successfully!")
        print(f"Total notes extracted: {len(beatmap)}")
        print(f"Saved beatmap JSON to: {args.output}")
        
        # 一時ダウンロードファイルの削除
        if args.url and os.path.exists(video_file):
            os.remove(video_file)
            print("Removed temporary video file.")

if __name__ == "__main__":
    main()
