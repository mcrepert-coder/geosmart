"""Creer une archive source prete a commiter, sans artefacts generes."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
archive = root.parent / (root.name + '.zip')
excluded = {'node_modules', '.gradle', '.kotlin', '.git', 'build', 'dist', '__pycache__', '.consumer-check', 'artifacts', 'livraison'}
files = [p for p in root.rglob('*') if p.is_file()
         and not excluded.intersection(p.relative_to(root).parts)
         and p.name not in {'.env', 'local.properties'} and p.suffix not in {'.log','.apk','.aar','.tgz','.zip'}]
with ZipFile(archive, 'w', ZIP_DEFLATED) as package:
    for file in sorted(files):
        package.write(file, root.name + '/' + file.relative_to(root).as_posix())
with ZipFile(archive) as package:
    assert package.testzip() is None
    names = set(package.namelist())
    for required in ['README.md', 'VERIFICATIONS.md', 'contracts/openapi.json',
                     'api/package-lock.json', 'api/src/index.ts', 'A-COMMITER.md',
                     'COMPATIBILITE-EQUIPE.md', 'contracts/auth.yaml', 'contracts/sync.yaml',
                     'mobile/beni/build.gradle.kts', 'mobile/gradlew.bat',
                     '.github/workflows/module-beni.yml']:
        assert root.name + '/' + required in names, required
    assert not any('/node_modules/' in p or '/.gradle/' in p or p.endswith('/.env') for p in names)
    assert not any('/livraison/' in p or p.endswith(('.apk','.aar','.tgz')) for p in names)
print(f'{archive} : {len(files)} fichiers, {archive.stat().st_size:,} octets. ZIP verifie.')
