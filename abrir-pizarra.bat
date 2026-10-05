@echo off
title Pizarra UdeC
cd /d "%~dp0"
echo.
echo   PIZARRA UdeC
echo   ------------
echo   Pizarra:   http://localhost:5173
echo   Moderador: http://localhost:5173/moderador
echo.
echo   Para detenerla: cierra esta ventana o pulsa Ctrl+C.
echo   Solo se ve en este computador. Para probar desde el celular: npm run dev:lan
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo   No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   Primera vez: instalando dependencias, puede tardar unos minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Fallo la instalacion. Revisa el mensaje de arriba.
    pause
    exit /b 1
  )
)

rem El navegador se abre solo, unos segundos despues, cuando el servidor ya responde.
if not "%1"=="--sin-navegador" (
  start "" /min cmd /c "timeout /t 6 >nul & start """" http://localhost:5173"
)

call npm run dev

echo.
echo   La pizarra se detuvo.
pause
