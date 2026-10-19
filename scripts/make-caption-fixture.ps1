param([string]$Voice='Microsoft Maria Desktop')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$captionRoot=Split-Path $PSScriptRoot -Parent
$captionFfmpeg=Join-Path $captionRoot 'node_modules/ffmpeg-static/ffmpeg.exe'
$captionFfprobe=Join-Path $captionRoot 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe'
$captionOutput=Join-Path $captionRoot 'tests/fixtures/captions-pt-BR.m4a'
$captionTemporary=Join-Path ([IO.Path]::GetTempPath()) ('corte-caption-'+[guid]::NewGuid().ToString()+'.wav')
$captionText='Oi, hoje estou aqui num restaurante novo em Dourados.'
$captionSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try{
 $captionSynth.SelectVoice($Voice)
 if($captionSynth.Voice.Culture.Name -ne 'pt-BR'){throw 'Use uma voz de cultura pt-BR para gerar esta fixture.'}
 $captionSynth.Rate=1
 $captionSynth.SetOutputToWaveFile($captionTemporary)
 $captionSynth.Speak($captionText)
 $captionSynth.SetOutputToNull()
 & $captionFfmpeg -v error -y -i $captionTemporary -ac 1 -ar 16000 -c:a aac -b:a 32k $captionOutput
 if($LASTEXITCODE -ne 0){throw 'Não foi possível codificar a fixture.'}
 $captionInfo=(& $captionFfprobe -v error -show_format -of json $captionOutput) | ConvertFrom-Json
 $captionDuration=[Convert]::ToDouble($captionInfo.format.duration,[Globalization.CultureInfo]::InvariantCulture)
 if($captionDuration -gt 6){throw 'A fixture precisa caber em seis segundos.'}
 [ordered]@{voice=$Voice;culture='pt-BR';rate=1;text=$captionText;duration=$captionDuration;expectedWords=@('hoje','aqui','restaurante','dourados')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $captionRoot 'tests/fixtures/captions-pt-BR.json') -Encoding utf8
}finally{$captionSynth.Dispose();Remove-Item -LiteralPath $captionTemporary -Force -ErrorAction SilentlyContinue}
