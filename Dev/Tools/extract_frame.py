import cv2
import os

def main():
    video_path = os.path.join("Dev", "Tools", "demo.mp4")
    output_path = os.path.join("Dev", "Tools", "frame_30s.png")
    
    print(f"Opening video file: {video_path}")
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print("Error: Could not open video file.")
        return
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"Video Metadata:")
    print(f"  - Resolution: {width}x{height}")
    print(f"  - FPS: {fps}")
    print(f"  - Total Frames: {total_frames}")
    print(f"  - Duration: {duration:.2f} seconds")
    
    # 30秒時点のフレーム位置を計算
    target_frame = int(30 * fps)
    if target_frame >= total_frames:
        target_frame = total_frames // 2
        print(f"Warning: 30 seconds is past the end of the video. Using middle frame instead: {target_frame}")
        
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    ret, frame = cap.read()
    
    if ret:
        cv2.imwrite(output_path, frame)
        print(f"Successfully saved frame {target_frame} to {output_path}")
    else:
        print("Error: Failed to read frame from video.")
        
    cap.release()

if __name__ == "__main__":
    main()
