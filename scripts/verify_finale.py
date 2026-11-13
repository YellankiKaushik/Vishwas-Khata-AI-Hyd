"""Read-only local asset verification; never invokes an AI provider or writes finance."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from dotenv import dotenv_values
from package_venue import assert_no_secret

ROOT = Path(__file__).resolve().parents[1]


def main():
    import sys
    if '--app-only' in sys.argv:
        from verify_application import main as verify_app
        return verify_app()
    source = ROOT / 'Project_Vishwas_Khata_V3'
    checks = []
    for line in (source / 'SHA256_MANIFEST.txt').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((source / name).read_bytes()).hexdigest() == digest, name
        checks.append(name)
    assert len(checks) == 34
    assets = ROOT / 'docs/finale/assets'
    video = assets / 'vishwas-khata-demo.mp4'
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(video)], text=True))
    assert len(metadata['streams']) == 1
    stream = metadata['streams'][0]
    assert stream['codec_name'] == 'h264' and (stream['width'], stream['height']) == (1600, 900)
    assert 90 <= float(metadata['format']['duration']) <= 180
    manifest = json.loads((ROOT / 'docs/evidence/finale-video.json').read_text())
    assert manifest['credit']['amount_paise'] == 50000 and manifest['repayment']['amount_paise'] == 20000
    assert manifest['journal_rows'] == 2 and manifest['outstanding_paise'] == 30000
    assert manifest['provider_calls'] == 0 and not manifest['physical_microphone']
    assert manifest['console_crashes'] == []
    assert int(metadata['format']['size']) == int(manifest['video']['format']['size'])
    deck = assets / 'Vishwas_Khata_Finale.pptx'
    with zipfile.ZipFile(deck) as archive:
        names = archive.namelist()
        slides = [x for x in names if x.startswith('ppt/slides/slide') and x.endswith('.xml')]
        notes = [x for x in names if x.startswith('ppt/notesSlides/notesSlide') and x.endswith('.xml')]
        media = [x for x in names if x.startswith('ppt/media/')]
        assert len(slides) == 10 and len(notes) == 10 and len(media) >= 2
        text = ' '.join(' '.join(ET.fromstring(archive.read(n)).itertext()) for n in slides)
        tests=json.loads((ROOT/'docs/release/RELEASE_METADATA.json').read_text(encoding='utf-8'))
        for phrase in ('Vishwas Khata', f"{tests['backend_passed']} application tests", 'hypothesis', 'pending'):
            assert phrase.lower() in text.lower(), phrase
        for i in range(1, 11):
            assert (ROOT / f'docs/finale/slides/slide-{i:02}.png').stat().st_size > 10000
    # Check the actual private key without printing it or placing it in evidence.
    key = dotenv_values(ROOT / '.env').get('SARVAM_API_KEY') or ''
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).split(b'\0')
    candidates = [ROOT / x.decode('utf-8') for x in tracked if x]
    candidates += list((ROOT / 'docs/finale').rglob('*')) + list((ROOT / 'apps/web/dist').rglob('*'))
    if key:
        for p in candidates:
            if p.is_file():
                assert_no_secret(p.read_bytes(),key.encode())
        with zipfile.ZipFile(deck) as archive:
            assert all(key.encode() not in archive.read(n) for n in archive.namelist())
    assert subprocess.run(['git', 'check-ignore', '-q', '.env'], cwd=ROOT).returncode == 0
    assert not subprocess.check_output(['git', 'ls-files', '--', '.env'], cwd=ROOT).strip()
    result = {'classification': 'LOCAL_RELEASE_ASSET_VERIFICATION', 'original_files_sha256_match': len(checks),
              'video_seconds': float(metadata['format']['duration']), 'video_audio_streams': 0,
              'golden_balance_paise': 30000, 'journal_rows': 2, 'editable_slides': len(slides),
              'speaker_note_parts': len(notes), 'embedded_media': len(media), 'slide_previews': 10,
              'sarvam_key_present': bool(key), 'key_ignored_untracked': True, 'secret_found_in_artifacts': False,
              'video_provider_calls': 0, 'new_release_provider_requests': 0,
              'historical_authenticated_stt_requests': 2, 'historical_tts_requests': 1,
              'physical_microphone_witnessed': False, 'human_tts_playback_witnessed': False,
              'assets_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (video, deck)}}
    pdf=assets/'Vishwas_Khata_Finale.pdf'
    pdfinfo=subprocess.check_output(['pdfinfo',str(pdf)],text=True)
    import re
    assert re.search(r'Pages:\s+10\b',pdfinfo) and re.search(r'JavaScript:\s+no',pdfinfo)
    result['pdf_pages']=10;result['pdf_type']='IMAGE_BASED_BACKUP_EDITABLE_SOURCE_IS_PPTX'
    result['assets_sha256'][pdf.name]=hashlib.sha256(pdf.read_bytes()).hexdigest()
    release=json.loads((ROOT/'docs/release/RELEASE_METADATA.json').read_text())
    assert subprocess.check_output(['git','rev-parse',release['application_tag']],cwd=ROOT,text=True).strip()==release['application_commit']
    assert not subprocess.check_output(['git','diff',release['application_commit'],'--','apps/api','apps/web/src','tests'],cwd=ROOT)
    backup=assets/'Vishwas_Khata_Venue_Backup.zip'
    package=json.loads((ROOT/'docs/evidence/venue-package.json').read_text())
    assert hashlib.sha256(backup.read_bytes()).hexdigest()==package['archive_sha256']
    result['assets_sha256'][backup.name]=package['archive_sha256']
    result['frozen_application_commit']=release['application_commit']
    result['runtime_source_unchanged_after_freeze']=True
    (ROOT / 'docs/evidence/finale-assets.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
