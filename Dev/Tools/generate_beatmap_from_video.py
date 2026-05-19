import cv2
import numpy as np
import json
import argparse
import os
import subprocess
import math

# 640x360 解像度におけるボタンの初期座標（フォールバック用）
DEFAULT_COORDINATES = {
    "yellow": (287, 203), # 左（黄色 ⇨）
    "red": (336, 203),    # 中（赤色 ⇧）
    "green": (385, 203)   # 右（緑色 ⇦）
}

ROI_RADIUS = 6           # 監視する矩形サイズ（13x13 ピクセル）
COOLDOWN_FRAMES = 6      # 多重検出防止クールダウン
THRESHOLD = 20.0          # 輝度（V値）の急激な変化（立ち上がり）の閾値
STABLE_REQUIRED_FRAMES = 10  # タップ判定開始に必要なサークル安定検出フレーム数（約0.3秒分）

# HSV カラーレンジの定義 (Hue: 0-180, Sat: 0-255, Val: 0-255)
COLOR_RANGES = {
    "yellow": [
        (np.array([12, 70, 70]), np.array([32, 255, 255]))
    ],
    "green": [
        (np.array([35, 60, 60]), np.array([85, 255, 255]))
    ],
    "red": [
        (np.array([0, 70, 70]), np.array([10, 255, 255])),
        (np.array([165, 70, 70]), np.array([180, 255, 255]))
    ]
}

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

def dist(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def detect_circles_of_color(hsv_frame, color):
    """特定の色の円形オブジェクトの座標リストを検出します"""
    # カラーマスクの作成
    mask = None
    for low, high in COLOR_RANGES[color]:
        m = cv2.inRange(hsv_frame, low, high)
        if mask is None:
            mask = m
        else:
            mask = cv2.bitwise_or(mask, m)
            
    # モルフォロジー演算でノイズ除去
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    # 輪郭の抽出
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    detected = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        perimeter = cv2.arcLength(cnt, True)
        
        # 面積フィルタ（ボタンサイズに適合するもの）
        if 100 <= area <= 2000:
            if perimeter > 0:
                # 円形度 (Circularity) の計算
                circularity = (4 * np.pi * area) / (perimeter ** 2)
                # 円形度が一定以上（ほぼ円形）のものをボタンサークルと見なす
                if circularity >= 0.60:
                    # 重心の計算
                    M = cv2.moments(cnt)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        detected.append((cx, cy))
                        
    return detected

def analyze_video_with_hsv_tracking(video_path, threshold, start_time):
    """HSV円形検出を用いてサークルを動的ロックオン追従しながらタイミングを検出します"""
    print(f"Analyzing video with HSV circle tracking and stability control: {video_path}")
    print(f"Ignore intro period: 0.0s to {start_time:.1f}s")
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return None
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video stats: {fps} FPS, {total_frames} total frames.")
    
    # 状態管理変数
    curr_coords = {color: DEFAULT_COORDINATES[color] for color in DEFAULT_COORDINATES}
    active = {color: False for color in DEFAULT_COORDINATES}
    stable_frames = {color: 0 for color in DEFAULT_COORDINATES}  # 安定出現フレームカウンタ
    prev_v = {color: 0.0 for color in DEFAULT_COORDINATES}
    cooldown = {color: 0 for color in DEFAULT_COORDINATES}
    beatmap = []
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 640x360にリサイズ（解像度のブレを統一するため）
        if frame.shape[1] != 640 or frame.shape[0] != 360:
            frame = cv2.resize(frame, (640, 360))
            
        timestamp = frame_idx / fps
        
        # 指定された開始時間より前は処理をスキップし、状態をリセットし続ける
        if timestamp < start_time:
            for color in DEFAULT_COORDINATES:
                prev_v[color] = 0.0
                stable_frames[color] = 0
                active[color] = False
            frame_idx += 1
            continue
            
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        v_channel = hsv[:, :, 2]
        
        # 1フレーム前の状態を保存
        was_active = {color: active[color] for color in active}
        
        for color in DEFAULT_COORDINATES:
            # クールダウン処理
            if cooldown[color] > 0:
                cooldown[color] -= 1
                
            # このフレームでのその色の円形検出
            detected = detect_circles_of_color(hsv, color)
            
            if len(detected) > 0:
                # 1フレーム前の座標に最も近い検出オブジェクトを選択して追跡
                best_circle = min(detected, key=lambda p: dist(p, curr_coords[color]))
                # 追跡距離が跳ね上がりすぎないように制限（誤検出ジャンプ防止、例えば120px以内）
                if dist(best_circle, curr_coords[color]) < 120 or not was_active[color]:
                    curr_coords[color] = best_circle
                    active[color] = True
                    stable_frames[color] += 1
                else:
                    active[color] = False
                    stable_frames[color] = 0
            else:
                active[color] = False
                stable_frames[color] = 0
                
            # タップ（発光）検出の実行
            # 画面上にボタンが安定して存在している（出現から指定フレーム以上経過している）場合のみ実行
            # ※was_activeを許容することで、タップした瞬間にエフェクトで円形度が崩れて一時的にロストした瞬間も検出可能にします
            if stable_frames[color] >= STABLE_REQUIRED_FRAMES or (was_active[color] and stable_frames[color] == 0):
                cx, cy = curr_coords[color]
                
                # 判定エリア（ROI）の平均明度を取得
                rx1 = max(0, cx - ROI_RADIUS)
                ry1 = max(0, cy - ROI_RADIUS)
                rx2 = min(640, cx + ROI_RADIUS + 1)
                ry2 = min(360, cy + ROI_RADIUS + 1)
                
                roi = v_channel[ry1:ry2, rx1:rx2]
                current_v = float(np.mean(roi))
                
                # 前フレームとの明度差分
                diff = current_v - prev_v[color]
                
                # 閾値判定
                if diff > threshold and cooldown[color] == 0:
                    beatmap.append({
                        "beat_index": len(beatmap) + 1,
                        "time": round(timestamp, 3),
                        "type": color,
                        "intensity": round(diff, 2),
                        "detected_pos": [cx, cy]
                    })
                    print(f"[DETECTED] Time: {timestamp:.3f}s | Color: {color:<6} | Pos: ({cx}, {cy}) | Diff: {diff:.2f}")
                    cooldown[color] = COOLDOWN_FRAMES
                        
                prev_v[color] = current_v
            else:
                # ボタンが画面にない期間、または出現直後の安定前期間は明度履歴をゼロリセット
                prev_v[color] = 0.0
                
        frame_idx += 1
        if frame_idx % 300 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")
            
    cap.release()
    return beatmap

def main():
    parser = argparse.ArgumentParser(description="Extract beatmap from Play video with HSV tracking and stability.")
    parser.add_argument("-u", "--url", help="YouTube video URL")
    parser.add_argument("-i", "--input", help="Local MP4 video path")
    parser.add_argument("-o", "--output", default=os.path.join("Dev", "Tools", "beatmap_output.json"), help="Output JSON path")
    parser.add_argument("-t", "--threshold", type=float, default=THRESHOLD, help="Brightness difference threshold")
    parser.add_argument("-s", "--start", type=float, default=6.0, help="Live start time in seconds to bypass loading/intro")
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

    # 解析実行（HSVトラッキング＆開始時間指定付き）
    beatmap = analyze_video_with_hsv_tracking(video_file, args.threshold, args.start)
    
    if beatmap is not None:
        output_data = {
            "metadata": {
                "source_video": video_file,
                "total_notes": len(beatmap),
                "threshold_used": args.threshold,
                "hsv_tracking": True,
                "stability_control": True,
                "start_time_ignore": args.start
            },
            "beatmap": beatmap
        }
        
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
            
        print(f"\nProcessing finished successfully!")
        print(f"Total notes extracted: {len(beatmap)}")
        print(f"Saved beatmap JSON to: {args.output}")

if __name__ == "__main__":
    main()
