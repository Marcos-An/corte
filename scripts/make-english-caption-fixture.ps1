param([string]$Voice='Microsoft Zira Desktop')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$captionRoot=Split-Path $PSScriptRoot -Parent
$captionOutput=Join-Path $captionRoot 'tests/fixtures/captions-en-US.m4a'
$captionTemporary=Join-Path ([IO.Path]::GetTempPath()) ('corte-caption-en-'+[guid]::NewGuid().ToString()+'.wav')
$captionText='Hello, today we are visiting a new restaurant. The food looks delicious.'
$captionSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try{
 $captionSynth.SelectVoice($Voice)
 if($captionSynth.Voice.Culture.Name -ne 'en-US'){throw 'Use uma voz de cultura en-US para gerar esta fixture.'}
 $captionSynth.Rate=1
 $captionSynth.SetOutputToWaveFile($captionTemporary)
 $captionSynth.Speak($captionText)
 $captionSynth.SetOutputToNull()
 & (Join-Path $captionRoot 'node_modules/ffmpeg-static/ffmpeg.exe') -v error -y -i $captionTemporary -ac 1 -ar 16000 -c:a aac -b:a 32k $captionOutput
 if($LASTEXITCODE -ne 0){throw 'Não foi possível codificar a fixture.'}
 $captionInfo=(& (Join-Path $captionRoot 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe') -v error -show_format -of json $captionOutput) | ConvertFrom-Json
 $captionDuration=[Convert]::ToDouble($captionInfo.format.duration,[Globalization.CultureInfo]::InvariantCulture)
 if($captionDuration -gt 8){throw 'A fixture precisa caber em oito segundos.'}
 [ordered]@{voice=$Voice;culture='en-US';rate=1;text=$captionText;duration=$captionDuration;expectedWords=@('hello','restaurant','food','delicious')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $captionRoot 'tests/fixtures/captions-en-US.json') -Encoding utf8
}finally{$captionSynth.Dispose();Remove-Item -LiteralPath $captionTemporary -Force -ErrorAction SilentlyContinue}
