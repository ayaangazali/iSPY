"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Camera, StopCircle, PlayCircle, Save, Loader2, Video, Phone, PhoneCall } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { DashboardLayout } from "@/components/dashboard-layout"
import TimestampList from "@/components/timestamp-list"
import ChatInterface from "@/components/chat-interface"
import { Timeline } from "../../components/Timeline"
import type { Timestamp } from "@/app/types"
import { detectEvents, type VideoEvent } from "./actions"

import type * as blazeface from '@tensorflow-models/blazeface'
import type * as posedetection from '@tensorflow-models/pose-detection'
import type * as tf from '@tensorflow/tfjs'

let tfjs: typeof tf
let blazefaceModel: typeof blazeface
let poseDetection: typeof posedetection

interface SavedVideo {
  id: string
  name: string
  url: string
  thumbnailUrl: string
  timestamps: Timestamp[]
}

interface Keypoint {
  x: number
  y: number
  score?: number
  name?: string
}

export default function Page() {
  const [isRecording, setIsRecording] = useState(false)
  const [timestamps, setTimestamps] = useState<Timestamp[]>([])
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [initializationProgress, setInitializationProgress] = useState('')
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [videoName, setVideoName] = useState('')
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null)
  const [mlModelsReady, setMlModelsReady] = useState(false)
  const [lastPoseKeypoints, setLastPoseKeypoints] = useState<Keypoint[]>([])
  const [isClient, setIsClient] = useState(false)
  
  // Vapi call states
  const [isCallingAlert, setIsCallingAlert] = useState(false)
  const [callStatus, setCallStatus] = useState<string | null>(null)
  const [lastCallTime, setLastCallTime] = useState<number>(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const detectionFrameRef = useRef<number | null>(null)
  const lastDetectionTime = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(performance.now())
  const startTimeRef = useRef<Date | null>(null)
  const faceModelRef = useRef<blazeface.BlazeFaceModel | null>(null)
  const poseModelRef = useRef<posedetection.PoseDetector | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const isRecordingRef = useRef<boolean>(false)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Trigger Vapi call for security alert
  const triggerSecurityCall = async (eventDescription: string, timestamp: string) => {
    // Prevent multiple calls within 30 seconds
    const now = Date.now()
    if (now - lastCallTime < 30000) {
      console.log("Skipping call - too soon after last call")
      return
    }

    setIsCallingAlert(true)
    setCallStatus("Initiating security call...")
    setLastCallTime(now)

    try {
      const response = await fetch("/api/vapi-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventDescription,
          timestamp,
          location: "Live security camera feed"
        })
      })

      const data = await response.json()

      if (response.ok) {
        setCallStatus("Security call connected!")
        setTimeout(() => setCallStatus(null), 5000)
      } else {
        setCallStatus(`Call failed: ${data.error}`)
        setTimeout(() => setCallStatus(null), 5000)
      }
    } catch (error: any) {
      console.error("Error triggering call:", error)
      setCallStatus(`Error: ${error.message}`)
      setTimeout(() => setCallStatus(null), 5000)
    } finally {
      setIsCallingAlert(false)
    }
  }

  // Demo button handler - triggers a test call
  const handleDemoCall = () => {
    const demoEvents = [
      "Physical altercation detected between two individuals",
      "Suspicious person attempting unauthorized access",
      "Potential theft in progress - individual concealing items",
      "Aggressive behavior detected near entrance",
      "Unattended package left in restricted area"
    ]
    const randomEvent = demoEvents[Math.floor(Math.random() * demoEvents.length)]
    const currentTimeStr = new Date().toLocaleTimeString()
    triggerSecurityCall(randomEvent, currentTimeStr)
  }

  const initMLModels = async () => {
    try {
      setIsInitializing(true)
      setMlModelsReady(false)
      setError(null)

      setInitializationProgress('Loading TensorFlow.js...')
      const tfPromise = import('@tensorflow/tfjs').then(async (tf) => {
        tfjs = tf
        await tf.ready()
        await tf.setBackend('webgl')
        await tf.env().set('WEBGL_FORCE_F16_TEXTURES', true)
        await tf.env().set('WEBGL_PACK', true)
        await tf.env().set('WEBGL_CHECK_NUMERICAL_PROBLEMS', false)
      })

      setInitializationProgress('Loading detection models...')
      const [blazefaceModule, poseDetectionModule] = await Promise.all([
        import('@tensorflow-models/blazeface'),
        import('@tensorflow-models/pose-detection')
      ])

      blazefaceModel = blazefaceModule
      poseDetection = poseDetectionModule

      await tfPromise

      setInitializationProgress('Initializing models...')
      const [faceModel, poseModel] = await Promise.all([
        blazefaceModel.load({ maxFaces: 1, scoreThreshold: 0.5 }),
        poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true, minPoseScore: 0.3 }
        )
      ])

      faceModelRef.current = faceModel
      poseModelRef.current = poseModel

      setMlModelsReady(true)
      setIsInitializing(false)
    } catch (err) {
      setError('Failed to load ML models: ' + (err as Error).message)
      setMlModelsReady(false)
      setIsInitializing(false)
    }
  }

  const updateCanvasSize = () => {
    if (!videoRef.current || !canvasRef.current) return
    canvasRef.current.width = 640
    canvasRef.current.height = 360
  }

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: true
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        mediaStreamRef.current = stream
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadedmetadata = () => { updateCanvasSize(); resolve() }
        })
      }
    } catch (error) {
      setError("Failed to access webcam. Please grant camera permissions.")
    }
  }

  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (recordedVideoUrl) { URL.revokeObjectURL(recordedVideoUrl); setRecordedVideoUrl(null) }
  }

  const initSpeechRecognition = () => {
    if (typeof window === "undefined") return
    if ("webkitSpeechRecognition" in window) {
      const SpeechRecognition = window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = ""
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
        }
        if (finalTranscript) setTranscript((prev) => prev + " " + finalTranscript)
      }
      recognitionRef.current = recognition
    }
  }

  const runDetection = async () => {
    if (!isRecordingRef.current) return
    const now = performance.now()
    if (now - lastDetectionTime.current < 100) {
      detectionFrameRef.current = requestAnimationFrame(runDetection)
      return
    }
    lastDetectionTime.current = now

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { detectionFrameRef.current = requestAnimationFrame(runDetection); return }

    const ctx = canvas.getContext("2d")
    if (!ctx) { detectionFrameRef.current = requestAnimationFrame(runDetection); return }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawVideoToCanvas(video, canvas, ctx)

    const scaleX = canvas.width / video.videoWidth
    const scaleY = canvas.height / video.videoHeight

    if (faceModelRef.current) {
      try {
        const predictions = await faceModelRef.current.estimateFaces(video, false)
        predictions.forEach((prediction: blazeface.NormalizedFace) => {
          const start = prediction.topLeft as [number, number]
          const end = prediction.bottomRight as [number, number]
          const size = [end[0] - start[0], end[1] - start[1]]
          const scaledStart = [start[0] * scaleX, start[1] * scaleY]
          const scaledSize = [size[0] * scaleX, size[1] * scaleX]

          ctx.strokeStyle = "#4DFFBC"
          ctx.lineWidth = 2
          ctx.strokeRect(scaledStart[0], scaledStart[1], scaledSize[0], scaledSize[1])

          const confidence = Math.round((prediction.probability as number) * 100)
          ctx.fillStyle = "white"
          ctx.font = "14px sans-serif"
          ctx.fillText(`${confidence}%`, scaledStart[0], scaledStart[1] - 5)
        })
      } catch (err) { console.error("Face detection error:", err) }
    }

    if (poseModelRef.current) {
      try {
        const poses = await poseModelRef.current.estimatePoses(video)
        if (poses.length > 0) {
          const keypoints = poses[0].keypoints
          const convertedKeypoints: Keypoint[] = keypoints.map(kp => ({
            x: kp.x, y: kp.y, score: kp.score ?? 0, name: kp.name
          }))
          setLastPoseKeypoints(convertedKeypoints)

          keypoints.forEach((keypoint) => {
            if ((keypoint.score ?? 0) > 0.3) {
              const x = keypoint.x * scaleX
              const y = keypoint.y * scaleY
              ctx.beginPath()
              ctx.arc(x, y, 4, 0, 2 * Math.PI)
              ctx.fillStyle = "#FF4D4D"
              ctx.fill()
              ctx.beginPath()
              ctx.arc(x, y, 6, 0, 2 * Math.PI)
              ctx.strokeStyle = "white"
              ctx.lineWidth = 1.5
              ctx.stroke()
            }
          })
        }
      } catch (err) { console.error("Pose detection error:", err) }
    }

    lastFrameTimeRef.current = performance.now()
    detectionFrameRef.current = requestAnimationFrame(runDetection)
  }

  const drawVideoToCanvas = (video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const videoAspect = video.videoWidth / video.videoHeight
    const canvasAspect = canvas.width / canvas.height
    let drawWidth = canvas.width, drawHeight = canvas.height, offsetX = 0, offsetY = 0
    if (videoAspect > canvasAspect) { drawHeight = canvas.width / videoAspect; offsetY = (canvas.height - drawHeight) / 2 }
    else { drawWidth = canvas.height * videoAspect; offsetX = (canvas.width - drawWidth) / 2 }
    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
  }

  const analyzeFrame = async () => {
    if (!isRecordingRef.current) return
    const currentTranscript = transcript.trim()

    try {
      const frame = await captureFrame()
      if (!frame || !frame.startsWith("data:image/jpeg")) return

      const result = await detectEvents(frame, currentTranscript)
      if (!isRecordingRef.current) return

      if (result.events && result.events.length > 0) {
        result.events.forEach(async (event: VideoEvent) => {
          const timestampStr = getElapsedTime()
          const newTimestamp = { timestamp: timestampStr, description: event.description, isDangerous: event.isDangerous }
          setTimestamps((prev) => [...prev, newTimestamp])

          if (event.isDangerous) {
            // Send email notification
            try {
              await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Dangerous Activity Detected", description: `At ${timestampStr}: ${event.description}` })
              })
            } catch (error) { console.error("Email error:", error) }

            // Trigger phone call for dangerous events
            triggerSecurityCall(event.description, timestampStr)
          }
        })
      }
    } catch (error) {
      console.error("Error analyzing frame:", error)
      if (isRecordingRef.current) stopRecording()
    }
  }

  const captureFrame = async (): Promise<string | null> => {
    if (!videoRef.current) return null
    const tempCanvas = document.createElement("canvas")
    tempCanvas.width = 640; tempCanvas.height = 360
    const context = tempCanvas.getContext("2d")
    if (!context) return null
    try { context.drawImage(videoRef.current, 0, 0, 640, 360); return tempCanvas.toDataURL("image/jpeg", 0.8) }
    catch { return null }
  }

  const getElapsedTime = () => {
    if (!startTimeRef.current) return "00:00"
    const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
    setCurrentTime(elapsed)
    return `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
  }

  const startRecording = () => {
    setCurrentTime(0); setVideoDuration(0)
    if (!mlModelsReady) { setError("ML models not ready"); return }
    if (!mediaStreamRef.current) return

    setError(null); setTimestamps([]); setAnalysisProgress(0)
    startTimeRef.current = new Date()
    isRecordingRef.current = true; setIsRecording(true)

    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    durationIntervalRef.current = setInterval(() => {
      if (isRecordingRef.current) setVideoDuration(Math.floor((Date.now() - startTimeRef.current!.getTime()) / 1000))
    }, 1000)

    if (recognitionRef.current) { setTranscript(""); setIsTranscribing(true); recognitionRef.current.start() }

    recordedChunksRef.current = []
    const mediaRecorder = new MediaRecorder(mediaStreamRef.current, { mimeType: "video/mp4" })
    mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data) }
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/mp4" })
      setRecordedVideoUrl(URL.createObjectURL(blob)); setVideoName("stream.mp4")
    }
    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start(1000)

    if (detectionFrameRef.current) cancelAnimationFrame(detectionFrameRef.current)
    lastDetectionTime.current = 0
    detectionFrameRef.current = requestAnimationFrame(runDetection)

    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current)
    analyzeFrame()
    analysisIntervalRef.current = setInterval(analyzeFrame, 3000)
  }

  const stopRecording = () => {
    startTimeRef.current = null; isRecordingRef.current = false; setIsRecording(false)
    if (recognitionRef.current) { recognitionRef.current.stop(); setIsTranscribing(false) }
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop()
    if (detectionFrameRef.current) { cancelAnimationFrame(detectionFrameRef.current); detectionFrameRef.current = null }
    if (analysisIntervalRef.current) { clearInterval(analysisIntervalRef.current); analysisIntervalRef.current = null }
    if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null }
  }

  const handleSaveVideo = () => {
    if (!recordedVideoUrl || !videoName) return
    try {
      const savedVideos: SavedVideo[] = JSON.parse(localStorage.getItem("savedVideos") || "[]")
      savedVideos.push({ id: Date.now().toString(), name: videoName, url: recordedVideoUrl, thumbnailUrl: recordedVideoUrl, timestamps })
      localStorage.setItem("savedVideos", JSON.stringify(savedVideos))
      alert("Video saved!")
    } catch { alert("Failed to save video") }
  }

  useEffect(() => { setIsClient(true) }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleLoadedMetadata = () => { setVideoDuration(video.duration || 60); video.currentTime = 0 }
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.currentTime = 0
    return () => { video.removeEventListener('timeupdate', handleTimeUpdate); video.removeEventListener('loadedmetadata', handleLoadedMetadata) }
  }, [recordedVideoUrl])

  useEffect(() => {
    initSpeechRecognition()
    const init = async () => { await startWebcam(); await initMLModels() }
    init()
    return () => {
      stopWebcam()
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current)
      if (detectionFrameRef.current) cancelAnimationFrame(detectionFrameRef.current)
    }
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Live Stream</h1>
            <p className="text-gray text-sm">Real-time video analysis with AI detection</p>
          </div>
          
          {/* Demo Call Button */}
          <button
            onClick={handleDemoCall}
            disabled={isCallingAlert}
            className="flex items-center gap-2 px-4 py-2.5 bg-coral text-white font-medium rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
          >
            {isCallingAlert ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Calling...
              </>
            ) : (
              <>
                <PhoneCall className="w-4 h-4" />
                Demo Alert Call
              </>
            )}
          </button>
        </div>

        {/* Call Status Banner */}
        {callStatus && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            callStatus.includes("connected") || callStatus.includes("Initiating") 
              ? "bg-mint/10 border border-mint/20 text-mint" 
              : "bg-coral/10 border border-coral/20 text-coral"
          }`}>
            <Phone className="w-5 h-5" />
            <span className="text-sm font-medium">{callStatus}</span>
          </div>
        )}

        <div className="max-w-4xl space-y-6">
          <div className="bg-[#111] rounded-xl border border-white/5 overflow-hidden">
            <div className="relative aspect-video bg-black">
              {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
                  <Loader2 className="w-10 h-10 animate-spin text-mint mb-3" />
                  <p className="text-gray text-sm">{initializationProgress}</p>
                </div>
              )}
              <div className="relative w-full h-full">
                {isClient && (
                  <video ref={videoRef} autoPlay playsInline muted width={640} height={360} className="absolute inset-0 w-full h-full object-cover opacity-0" />
                )}
                <canvas ref={canvasRef} width={640} height={360} className="absolute inset-0 w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {error && !isInitializing && (
            <div className="p-4 bg-coral/10 border border-coral/20 rounded-xl text-coral text-sm">{error}</div>
          )}

          <div className="flex justify-center gap-3">
            {isInitializing ? (
              <button disabled className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-gray rounded-lg cursor-not-allowed">
                <Loader2 className="w-4 h-4 animate-spin" /> Initializing...
              </button>
            ) : !isRecording ? (
              <button onClick={startRecording} className="flex items-center gap-2 px-5 py-2.5 bg-mint text-gray-dark font-medium rounded-lg hover:bg-mint-light transition-colors">
                <PlayCircle className="w-4 h-4" /> Start Analysis
              </button>
            ) : (
              <button onClick={stopRecording} className="flex items-center gap-2 px-5 py-2.5 bg-coral text-white font-medium rounded-lg hover:bg-coral-light transition-colors">
                <StopCircle className="w-4 h-4" /> Stop
              </button>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-coral animate-pulse" />
              <span className="text-sm text-gray">Recording and analyzing... Auto-calling on dangerous events</span>
            </div>
          )}

          <div className="bg-[#111] rounded-xl border border-white/5 p-5">
            <h2 className="text-white font-medium mb-3">Key Moments</h2>
            {timestamps.length > 0 ? (
              <Timeline
                events={timestamps.map(ts => {
                  const [minutes, seconds] = ts.timestamp.split(':').map(Number)
                  return { startTime: minutes * 60 + seconds, endTime: minutes * 60 + seconds + 3, type: ts.isDangerous ? 'warning' : 'normal', label: ts.description }
                })}
                totalDuration={videoDuration || 60}
                currentTime={currentTime}
              />
            ) : (
              <p className="text-gray text-sm">{isRecording ? "Waiting for events..." : "Start analysis to detect events"}</p>
            )}
          </div>

          <TimestampList timestamps={timestamps} onTimestampClick={() => {}} />

          <div className="bg-[#111] rounded-xl border border-white/5 p-5">
            <h2 className="text-white font-medium mb-3">Audio Transcript</h2>
            {isTranscribing && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-mint animate-pulse" />
                <span className="text-xs text-gray">Transcribing...</span>
              </div>
            )}
            <p className="text-gray text-sm whitespace-pre-wrap">
              {transcript || (isRecording ? "Waiting for speech..." : "Start recording to capture audio")}
            </p>
          </div>

          {isClient && !isRecording && recordedVideoUrl && (
            <div className="bg-mint/5 border border-mint/20 rounded-xl p-5">
              <h2 className="text-white font-medium mb-3">Save Recording</h2>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Video name"
                  value={videoName}
                  onChange={(e) => setVideoName(e.target.value)}
                  className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray/50"
                />
                <button
                  onClick={handleSaveVideo}
                  disabled={!videoName}
                  className="px-4 py-2 bg-mint text-gray-dark font-medium rounded-lg hover:bg-mint-light transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          )}
        </div>

        <ChatInterface timestamps={timestamps} />
      </div>
    </DashboardLayout>
  )
}
