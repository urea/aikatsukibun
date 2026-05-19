import cv2
import numpy as np
import json
import argparse
import os
import subprocess

# 640x360 解像度における水色の判定リングの中心座標
TARGET_CX = 315
TARGET_CY = 193
ROI_SIZE = 15            # 中心から上下左右15px（30x30の矩形）

COOLDOWN_FRAMES = 12      # 多重検出防止クールダウン
THRESHOLD_PX_DIFF = 45   # カラーピクセル数の急激な増加（立ち上がり）の閾値

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

def analyze_video_fixed_target(video_path, threshold_diff, start_time):
    """判定リングの固定座標を定点監視し、各色のピクセル数急増からタップタイミングを抽出します"""
    print(f"Analyzing video with Fixed Target Pixel Count change: {video_path}")
    print(f"Target coordinates: ({TARGET_CX}, {TARGET_CY}), ROI size: {ROI_SIZE*2}x{ROI_SIZE*2}")
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return None
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video stats: {fps} FPS, {total_frames} total frames.")
    
    # 状態管理変数
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
            
        # 判定リング周辺のROI抽出
        roi = frame[TARGET_CY - ROI_SIZE:TARGET_CY + ROI_SIZE, TARGET_CX - ROI_SIZE:TARGET_CX + ROI_SIZE]
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        
        for color in COLOR_RANGES:
            # クールダウン処理
            if cooldown[color] > 0:
                cooldown[color] -= 1
                
            # 各カラーマスクの生成
            mask = None
            for low, high in COLOR_RANGES[color]:
                m = cv2.inRange(hsv, low, high)
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
                    "detected_pos": [TARGET_CX, TARGET_CY]
                })
                print(f"[DETECTED] Time: {timestamp:.3f}s | Color: {color:<6} | Px Diff: +{diff} | Px Total: {current_px}")
                cooldown[color] = COOLDOWN_FRAMES
                
            prev_px[color] = current_px
            
        if frame_idx % 300 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")
            
    cap.release()
    return beatmap

def main():
    parser = argparse.ArgumentParser(description="Extract beatmap from Aikatsu play video via fixed target monitoring.")
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

    # 定点ピクセル監視で解析実行
    beatmap = analyze_video_fixed_target(video_file, args.threshold, args.start)
    
    if beatmap is not None:
        output_data = {
            "metadata": {
                "source_video": video_file,
                "total_notes": len(beatmap),
                "threshold_used": args.threshold,
                "fixed_target_monitoring": True,
                "target_coordinates": [TARGET_CX, TARGET_CY],
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
