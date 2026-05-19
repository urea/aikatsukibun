import cv2
import numpy as np
import json
import argparse
import os
import subprocess
import math

# 640x360 解像度における水色の判定リングのデフォルトの初期座標
DEFAULT_TARGET_CX = 315
DEFAULT_TARGET_CY = 193
ROI_SIZE = 15            # 中心から上下左右15px（30x30の矩形）

COOLDOWN_FRAMES = 12      # 多重検出防止クールダウン
THRESHOLD_PX_DIFF = 45   # カラーピクセル数の急激な増加（立ち上がり）の閾値

# HSV カラーレンジ of 監視色 (Hue: 0-180, Sat: 0-255, Val: 0-255)
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

# 水色（判定リング本体）のHSVカラーレンジ
CYAN_RANGE = (np.array([85, 70, 70]), np.array([115, 255, 255]))

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

def detect_cyan_judgment_ring(hsv_frame, last_cx, last_cy, lost_frames):
    """HSV色空間から水色の判定リングを検出し、中心座標とロストフレーム数を返します"""
    low, high = CYAN_RANGE
    mask = cv2.inRange(hsv_frame, low, high)
    
    # 輪郭の抽出
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        perimeter = cv2.arcLength(cnt, True)
        
        # 面積フィルタ（判定リングサイズに適するもの）
        if 200 <= area <= 1500:
            if perimeter > 0:
                # 円形度 (Circularity) を計算
                circularity = (4 * np.pi * area) / (perimeter ** 2)
                # ノーツが重なったりエフェクトで歪むため、円形度の閾値を 0.20 に引き下げます
                if circularity >= 0.20:
                    M = cv2.moments(cnt)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        candidates.append((cx, cy))
                        
    if len(candidates) > 0:
        # もし長期間見失っている（または未初期化）なら、距離制限なしで、
        # デフォルト初期座標に最も近い水色候補を瞬時に強制ロックオンする（ロスト復帰）
        if lost_frames >= 5:
            best_ring = min(candidates, key=lambda p: dist(p, (DEFAULT_TARGET_CX, DEFAULT_TARGET_CY)))
            return best_ring[0], best_ring[1], 0
        else:
            # 安定追尾中なら、前フレームの座標に最も近いものを選択
            best_ring = min(candidates, key=lambda p: dist(p, (last_cx, last_cy)))
            if dist(best_ring, (last_cx, last_cy)) < 100:
                return best_ring[0], best_ring[1], 0
            
    # 見つからない場合はロストフレーム数をカウントアップ
    return last_cx, last_cy, lost_frames + 1

def analyze_video_dynamic_target(video_path, threshold_diff, start_time):
    """判定リング自体を動的トラッキングし、リング周辺のカラーピクセル急増からタイミングを抽出します"""
    print(f"Analyzing video with DYNAMIC TARGET (Cyan Ring) tracking: {video_path}")
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return None
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video stats: {fps} FPS, {total_frames} total frames.")
    
    # 状態管理変数
    target_cx = DEFAULT_TARGET_CX
    target_cy = DEFAULT_TARGET_CY
    lost_frames = 100  # 初期状態はロスト状態（100フレームロスト扱い）とし、最初のフレームで強制ロックオンを走らせる
    
    prev_px = {color: 0 for color in COLOR_RANGES}
    cooldown = {color: 0 for color in COLOR_RANGES}
    beatmap = []
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_idx += 1
        timestamp = frame_idx / fps
        
        # 指定された開始時間より前は処理をスキップ
        if timestamp < start_time:
            for color in COLOR_RANGES:
                prev_px[color] = 0
            continue
            
        # 640x360に解像度を統一
        if frame.shape[1] != 640 or frame.shape[0] != 360:
            frame = cv2.resize(frame, (640, 360))
            
        hsv_full = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # 水色判定リングのリアルタイム追尾（ロスト復帰付き）
        target_cx, target_cy, lost_frames = detect_cyan_judgment_ring(
            hsv_full, target_cx, target_cy, lost_frames
        )
        
        # 境界ガード付きのROI抽出座標
        ry1 = max(0, target_cy - ROI_SIZE)
        ry2 = min(360, target_cy + ROI_SIZE)
        rx1 = max(0, target_cx - ROI_SIZE)
        rx2 = min(640, target_cx + ROI_SIZE)
        
        roi = frame[ry1:ry2, rx1:rx2]
        hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        
        for color in COLOR_RANGES:
            # クールダウン処理
            if cooldown[color] > 0:
                cooldown[color] -= 1
                
            # 各カラーマスクの生成
            mask = None
            for low, high in COLOR_RANGES[color]:
                m = cv2.inRange(hsv_roi, low, high)
                if mask is None:
                    mask = m
                else:
                    mask = cv2.bitwise_or(mask, m)
                    
            # ROI内の該当色ピクセル数をカウント
            current_px = cv2.countNonZero(mask)
            
            # ピクセル数の増加量（前フレームとの差分）
            diff = current_px - prev_px[color]
            
            # 閾値判定（ピクセル数が急増し、かつクールダウン中でない場合）
            if diff >= threshold_diff and cooldown[color] == 0:
                beatmap.append({
                    "beat_index": len(beatmap) + 1,
                    "time": round(timestamp, 3),
                    "type": color,
                    "intensity": int(diff),
                    "detected_pos": [target_cx, target_cy]  # その瞬間の判定リングの位置を動的保存！
                })
                print(f"[DETECTED] Time: {timestamp:.3f}s | Color: {color:<6} | Ring Pos: ({target_cx}, {target_cy}) | Px Diff: +{diff}")
                cooldown[color] = COOLDOWN_FRAMES
                
            prev_px[color] = current_px
            
        if frame_idx % 300 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")
            
    cap.release()
    return beatmap

def main():
    parser = argparse.ArgumentParser(description="Extract beatmap from Aikatsu play video via dynamic target tracking.")
    parser.add_argument("-u", "--url", help="YouTube video URL")
    parser.add_argument("-i", "--input", help="Local MP4 video path")
    parser.add_argument("-o", "--output", default=os.path.join("Dev", "Tools", "beatmap_output.json"), help="Output JSON path")
    parser.add_argument("-t", "--threshold", type=int, default=THRESHOLD_PX_DIFF, help="Pixel difference threshold for detection")
    parser.add_argument("-s", "--start", type=float, default=1.5, help="Live start time in seconds (skips loading/dark screen)")
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

    # 動的ピクセル監視で解析実行
    beatmap = analyze_video_dynamic_target(video_file, args.threshold, args.start)
    
    if beatmap is not None:
        output_data = {
            "metadata": {
                "source_video": video_file,
                "total_notes": len(beatmap),
                "threshold_used": args.threshold,
                "dynamic_target_tracking": True,
                "default_coordinates": [DEFAULT_TARGET_CX, DEFAULT_TARGET_CY],
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
