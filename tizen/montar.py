#!/usr/bin/env python3
"""Monta a pasta do app Samsung (tizen-build/) a partir do app da LG (webos/).
Nenhum arquivo da LG é alterado. Uso (na raiz do repositório):  python3 tizen/montar.py
"""
import json, os, re, shutil, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBOS = os.path.join(RAIZ, 'webos')
TIZEN = os.path.join(RAIZ, 'tizen')
SAIDA = os.path.join(RAIZ, 'tizen-build')

if os.path.exists(SAIDA):
    shutil.rmtree(SAIDA)
shutil.copytree(WEBOS, SAIDA)
os.remove(os.path.join(SAIDA, 'appinfo.json'))

versao = json.load(open(os.path.join(WEBOS, 'appinfo.json')))['version']
cfg = open(os.path.join(TIZEN, 'config.xml'), encoding='utf-8').read().replace('__VERSAO__', versao)
open(os.path.join(SAIDA, 'config.xml'), 'w', encoding='utf-8').write(cfg)
shutil.copy(os.path.join(TIZEN, 'tizen-shim.js'), os.path.join(SAIDA, 'js', 'tizen-shim.js'))

caminho = os.path.join(SAIDA, 'index.html')
html = open(caminho, encoding='utf-8').read()

# 1) biblioteca da Samsung (webapis) antes de tudo
if '<script src="js/config.js"></script>' not in html or '<script src="js/platform.js"></script>' not in html:
    sys.exit('ERRO: index.html da LG mudou (config.js/platform.js não encontrados). Ajuste tizen/montar.py.')
html = html.replace('<script src="js/config.js"></script>',
                    '<script src="$WEBAPIS/webapis/webapis.js"></script>\n  <script src="js/config.js"></script>', 1)
# 2) adaptador logo depois do platform.js
html = html.replace('<script src="js/platform.js"></script>',
                    '<script src="js/platform.js"></script>\n  <script src="js/tizen-shim.js"></script>', 1)
# 3) o zoom 1280x720 é só da LG; na Samsung o app já roda em 1920x1080
html = re.sub(r"if \(w && w < 1900\) \{[^}]*\}", "/* sem zoom na Samsung */", html, count=1)
open(caminho, 'w', encoding='utf-8').write(html)

for f in ('config.xml', 'index.html', 'js/tizen-shim.js', 'icon.png'):
    if not os.path.exists(os.path.join(SAIDA, f)):
        sys.exit('ERRO: faltou ' + f)
print('Pasta tizen-build pronta (versão %s).' % versao)
