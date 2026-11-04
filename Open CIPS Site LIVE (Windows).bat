@echo off
rem Double-click this file (Windows) to look at the CIPS live site on your own PC.
rem A black window opens: that is the small web server. Leave it open while you look, close it when you are done.
rem Your browser opens the site. Nothing here changes any files, and it shows whatever branch is checked out in this folder.
title CIPS Site LIVE
cd /d "%~dp0tools" || (echo Cannot find the tools folder next to this file. & pause & exit /b 1)
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org then double-click this file again. & pause & exit /b 1)
node serve.mjs
if errorlevel 1 pause
