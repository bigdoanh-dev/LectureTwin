"""Build the authored 50-second lecture excerpt locally; no external media or AI."""
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'backend' / 'data' / 'media'
FONT_PATHS = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']


def font(size):
    path = next((p for p in FONT_PATHS if Path(p).exists()), None)
    return ImageFont.truetype(path, size) if path else ImageFont.load_default(size=size)


def build():
    DEST.mkdir(parents=True, exist_ok=True)
    output = DEST / 'sample-lecture.mp4'
    if output.exists():
        return output
    if not shutil.which('ffmpeg'):
        raise RuntimeError('Cần FFmpeg để dựng video mẫu; bản demo chưa có ASR/vision.')
    pages = [
        ('Graph traversal', 'Vertices, edges and a visited set', [], 10),
        ('Breadth-first search', 'FIFO queue | Visit layer by layer', ['A', 'B', 'C'], 12),
        ('Depth-first search', 'Go deep, then backtrack | Stack or recursion', ['A', 'B', 'D', 'E'], 14),
        ('Compare the same graph', 'BFS: A B C D E F     DFS: A B D E C F', ['A', 'B', 'D', 'E', 'C', 'F'], 10),
        ('Check your understanding', 'Which traversal uses a FIFO queue?', [], 4),
    ]
    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        entries = []
        for index, (title, subtitle, visited, seconds) in enumerate(pages):
            image = Image.new('RGB', (1280, 720), '#15233b')
            draw = ImageDraw.Draw(image)
            draw.text((60, 45), 'LECTURETWIN AI / AUTHORED DEMO EXCERPT', font=font(19), fill='#8ca1bc')
            draw.text((60, 100), title, font=font(51), fill='#ffffff')
            draw.text((60, 172), subtitle, font=font(25), fill='#a7bedb')
            points = {'A': (650, 290), 'B': (430, 425), 'C': (870, 425), 'D': (300, 560), 'E': (560, 560), 'F': (1000, 560)}
            for left, right in [('A', 'B'), ('A', 'C'), ('B', 'D'), ('B', 'E'), ('C', 'F')]:
                color = '#2dd4bf' if left in visited and right in visited else '#6a7f9d'
                draw.line([points[left], points[right]], fill=color, width=5)
            for label, (x, y) in points.items():
                color = '#2dd4bf' if label in visited else '#8ba0bd'
                draw.ellipse((x - 36, y - 36, x + 36, y + 36), fill='#1e3551', outline=color, width=4)
                draw.text((x, y), label, anchor='mm', font=font(31), fill='#ffffff')
            draw.text((60, 668), 'Prepared visual annotations / No voice recognition or vision model', font=font(19), fill='#8ca1bc')
            page = temporary / f'page-{index}.png'
            image.save(page)
            entries += [f"file '{page.as_posix()}'", f'duration {seconds}']
        entries.append(f"file '{page.as_posix()}'")
        listing = temporary / 'frames.concat'
        listing.write_text('\n'.join(entries))
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
            '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '50', '-vf', 'fps=15,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', str(output)], check=True, timeout=90)
    return output


if __name__ == '__main__':
    print(build())
