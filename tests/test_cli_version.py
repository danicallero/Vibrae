import subprocess, sys, os

def test_cli_version_invokes():
    root = os.path.dirname(__file__)
    repo_root = os.path.abspath(os.path.join(root, '..'))
    cli = os.path.join(repo_root, 'vibrae')
    if not os.path.isfile(cli):
        raise RuntimeError('CLI entry script not found')
    out = subprocess.check_output(['bash', cli, 'version']).decode().strip()
    assert out.startswith('vibrae ')
