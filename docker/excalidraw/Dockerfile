# Excalidraw, pointed at our own collaboration server and usable in a frame.
#
# The upstream app is a Vite bundle: `VITE_APP_WS_SERVER_URL` is inlined at
# build time from `.env.production`, so the published image always talks to
# `oss-collab.excalidraw.com` and no runtime variable can change that.
# Rebuilding the whole app from source to flip one URL costs several minutes,
# so we patch the built assets instead, with plain string replacements in the
# emitted JavaScript. Each one is checked: the build fails if the upstream
# bundle changed and a patch no longer applies.
FROM excalidraw/excalidraw:latest

ARG WS_SERVER_URL=http://localhost:9815

COPY sw.js username.js /tmp/

WORKDIR /usr/share/nginx/html

# 1. The collaboration server.
# 2. The app turns collaboration off when it runs in a frame, and the meeting
#    window embeds it: every participant would draw alone, on the board the
#    browser kept from the previous meeting. It is told it runs on its own.
#    It also replaces itself with "I'm not a pretzel!" when the frame's
#    referrer is its own origin, which any reload inside the frame causes.
# 3. Its service worker caches the bundle by the upstream revisions, which the
#    patches above do not change: browsers would keep an unpatched copy. It is
#    replaced by one that empties that cache and removes itself.
# 4. `username.js` names the participant on the board, from `?u=` in the address.
RUN set -eu; \
    grep -rlq "https://oss-collab.excalidraw.com" . ; \
    find . -type f \( -name "*.js" -o -name "*.html" \) \
      -exec sed -i "s|https://oss-collab.excalidraw.com|${WS_SERVER_URL}|g" {} + ; \
    grep -rlq 'window.self===window.top?"top":"iframe"' assets ; \
    find assets -type f -name "*.js" -exec sed -i \
      -e 's|window.self===window.top?"top":"iframe"|"top"|g' \
      -e 's|catch{return"iframe"}|catch{return"top"}|g' {} + ; \
    ! grep -rq '?"top":"iframe"' assets ; \
    grep -rlq 'if(window.self!==window.top)try{const [A-Za-z_$]*=new URL(document.referrer)' assets ; \
    find assets -type f -name "*.js" -exec sed -i \
      -e 's|if(window.self!==window.top)try{\(const [A-Za-z_$]*=new URL(document.referrer)\)|if(!1)try{\1|g' {} + ; \
    ! grep -rq 'window.self!==window.top' assets ; \
    test -f sw.js ; \
    cp /tmp/sw.js sw.js ; \
    cp /tmp/username.js username.js ; \
    grep -q '"excalidraw-collab"' assets/index-*.js ; \
    grep -q '</head>' index.html ; \
    sed -i 's|</head>|<script src="/username.js"></script></head>|' index.html ; \
    grep -q 'username.js' index.html
