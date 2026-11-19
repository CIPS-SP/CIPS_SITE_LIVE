@echo off
rem Double-click this file (Windows) to choose photos for the desk pages' carousels.
rem A black window opens: that is the picker. Leave it open while you choose, close it when you are done.
rem Your browser opens the picker. It only reads the CIPS Image Library in Dropbox; your picks are saved in tools\picker-picks.json.
title CIPS image picker
cd /d "%~dp0" || (echo Cannot find the folder this file is in. & pause & exit /b 1)
where python >nul 2>nul || (echo Python is not installed. Install it from https://www.python.org then double-click this file again. & pause & exit /b 1)
start "" http://localhost:8095
python tools\image-picker.py
if errorlevel 1 pause
