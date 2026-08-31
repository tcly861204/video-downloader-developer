rm -rf ./framecatch
mkdir ./framecatch
cp -r functions ./framecatch/functions
cd ./framecatch
git init
git add .
git commit -m "deploy"
git remote add origin https://github.com/tcly861204/video-downloader-developer.git
git branch gh-pages
git checkout gh-pages
git push origin gh-pages -f