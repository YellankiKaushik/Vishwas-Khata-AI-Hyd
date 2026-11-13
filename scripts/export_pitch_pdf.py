"""Portable image-based PDF export; PPTX remains the editable source."""
import argparse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def main():
    from artifact_policy import require_final_asset_phase
    require_final_asset_phase()
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.lib.utils import ImageReader
    parser=argparse.ArgumentParser()
    parser.add_argument('--release-assets', action='store_true')
    parser.add_argument('--slides-dir',type=Path,default=ROOT/'docs/finale/slides')
    args=parser.parse_args()
    images=[args.slides_dir/f'slide-{number:02}.png' for number in range(1,11)]
    if not all(p.is_file() for p in images):raise SystemExit('All ten verified slide renders are required.')
    output=ROOT/'docs/finale/assets/Vishwas_Khata_Finale.pdf'
    canvas=Canvas(str(output),pagesize=(960,540),pageCompression=1)
    canvas.setTitle('Vishwas Khata — Finalist Presentation')
    canvas.setAuthor('Team Tic Tac Tech')
    canvas.setSubject('Synthetic localhost prototype. Image-based slide backup; editable source is the PPTX.')
    for path in images:
        image=ImageReader(str(path));width,height=image.getSize()
        if abs(width/height-16/9)>.001:raise SystemExit('Slide aspect ratio must be 16:9; no stretching allowed.')
        canvas.drawImage(image,0,0,width=960,height=540,preserveAspectRatio=True,anchor='c')
        canvas.showPage()
    canvas.save()
    print(f'Wrote ten 16:9 image-based pages: {output}')


if __name__=='__main__':main()
