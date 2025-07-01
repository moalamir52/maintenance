@echo off
SETLOCAL ENABLEEXTENSIONS

echo 🚀 جاري تحديث صفحة GitHub Pages من master ...

:: اسم الريبو
set REPO=https://github.com/moalamir52/maintenance.git

:: حذف temp-publish لو موجود
if exist temp-publish (
    rmdir /s /q temp-publish
)

:: إنشاء مجلد مؤقت خارج المجلد الحالي لتجنب cyclic copy
mkdir ../temp-publish
xcopy * ../temp-publish /E /I /Y /EXCLUDE:exclude.txt

cd ../temp-publish

:: تهيئة Git جديدة
git init
git remote add origin %REPO%
git checkout -b gh-pages

:: حذف ملفات غير مطلوبة (اختياري)
del /f /q .gitignore
rmdir /s /q node_modules 2>nul

:: إضافة الملفات
git add .
git commit -m "📄 نشر تلقائي من master"
git push --force origin gh-pages

cd ..
rmdir /s /q temp-publish

echo ✅ تم النشر على GitHub Pages
pause
