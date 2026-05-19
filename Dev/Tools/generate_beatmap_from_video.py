import cv2
import numpy as np
import json
import argparse
import os
import subprocess

# 640x360 解像度におけるボタン（判定サークル）の座標
DEFAULT_COORDINATES = {
    "yellow": (287, 203), # 左（黄色 ⇨）
    "red": (336, 203),    # 中（赤色 ⇧）
    "green": (385, 203)   # 右（緑色 ⇦）
}

ROI_RADIUS = 6        # 監視する矩形サイズ（13x13 ピクセル）
COOLDOWN_FRAMES = 6   # 多重検出防止クールダウン（30fpsで0.2秒分）
THRESHOLD = 25.0       # 輝度（V値）の急激な変化（立ち上がり）の閾値

def download_video(url, output_path):
    """yt-dlp を使用して動画をダウンロードします"""
    print(f"Downloading video from URL: {url} -> {output_path}")
    # yt-dlp コマンドの構築
    cmd = [
        "yt-dlp",
        "-f", "best[ext=mp4]/mp4",
        url,
        "-o", output_path
    ]
    subprocess.run(cmd, check=True)
    print("Download completed.")

def analyze_video(video_path, coords, threshold):
    """動画をスキャンして色とタイミングを検出します"""
    print(f"Analyzing video: {video_path}")
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return None
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video stats: {fps} FPS, {total_frames} total frames.")
    
    # 状態管理変数
    prev_v = {color: 0.0 for color in coords}
    cooldown = {color: 0 for color in coords}
    beatmap = []
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 640x360にリサイズ（解像度のブレを統一するため）
        if frame.shape[1] != 640 or frame.shape[0] != 360:
            frame = cv2.resize(frame, (640, 360))
            
        # HSVに変換して明度（V）のみを取り出す
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        v_channel = hsv[:, :, 2]
        
        timestamp = frame_idx / fps
        
        for color, (cx, cy) in coords.items():
            # クールダウン処理
            if cooldown[color] > 0:
                cooldown[color] -= 1
                
            # 判定ポイント（ROI）の平均明度を取得
            roi = v_channel[cy - ROI_RADIUS : cy + ROI_RADIUS + 1, cx - ROI_RADIUS : cx + ROI_RADIUS + 1]
            current_v = float(np.mean(roi))
            
            # 明度の時間微分（前フレームからの差分）
            diff = current_v - prev_v[color]
            
            # 閾値を超えた場合、かつクールダウン中でない場合を検出
            if diff > threshold and cooldown[color] == 0:
                # 最初の数フレーム（動画開始直後）はフェードインによる誤検知を防ぐため除外
                if frame_idx > int(fps * 1.5):
                    beatmap.append({
                        "beat_index": len(beatmap) + 1,
                        "time": round(timestamp, 3),
                        "type": color,
                        "intensity": round(diff, 2)
                    })
                    print(f"[DETECTED] Time: {timestamp:.3f}s | Color: {color:<6} | Diff: {diff:.2f}")
                    cooldown[color] = COOLDOWN_FRAMES
                    
            prev_v[color] = current_v
            
        frame_idx += 1
        
    cap.release()
    return beatmap

def main():
    parser = argparse.ArgumentParser(description="Extract beatmap from Aikatsu play video.")
    parser.add_argument("-u", "--url", help="YouTube video URL")
    parser.add_argument("-i", "--input", help="Local MP4 video path (uses Dev/Tools/demo.mp4 by default if exists)")
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

    # 解析実行
    beatmap = analyze_video(video_file, DEFAULT_COORDINATES, args.threshold)
    
    if beatmap is not None:
        output_data = {
            "metadata": {
                "source_video": video_file,
                "total_notes": len(beatmap),
                "threshold_used": args.threshold
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
