import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  User, Lock, Eye, EyeOff, Search, BarChart2, MessageSquare, Users, 
  ShieldCheck, Info, GraduationCap, Settings, Phone, Globe, ChevronRight, 
  Award, BookOpen, X, Volume2, Heart, Sparkles, UserCheck, Gamepad2, 
  FileText, Check, CheckCircle2, ChevronDown, Play, Mail, MapPin, 
  RotateCw, Menu, HelpCircle, VolumeX, MessageCircleOff, Brain, 
  Gift, DollarSign, Flame, ArrowRight, Star, GraduationCap as CapIcon
} from 'lucide-react'
import { signIn, signInTeacher } from '@/lib/auth'
import { useLanguageStore } from '@/stores/languageStore'
import { Modal } from '@/components/ui/Modal'

const loginSchema = z.object({
  username: z.string().min(3, 'Tài khoản tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  remember: z.boolean().optional()
})

type LoginData = z.infer<typeof loginSchema>

// =========================================================================
// CUSTOM VECTOR CARTOON ILLUSTRATIONS (MATCHING MOCKUP GRAPHICS)
// =========================================================================

// Section 1 Problems SVGs
function GirlThinkingSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#FFF1F2" />
      {/* Speech bubble shadow */}
      <path d="M 28,34 H 72 C 77,34 81,38 81,43 V 55 C 81,60 77,64 72,64 H 42 L 30,73 V 64 H 28 C 23,64 19,60 19,55 V 43 C 19,38 23,34 28,34 Z" fill="#FDA4AF" opacity="0.6" />
      {/* Main Speech bubble */}
      <path d="M 32,38 H 68 C 72,38 75,41 75,45 V 53 C 75,57 72,60 68,60 H 44 L 35,67 V 60 H 32 C 28,60 25,57 25,53 V 45 C 25,41 28,38 32,38 Z" fill="#E11D48" />
      {/* Padlock */}
      <rect x="42" y="48" width="16" height="12" rx="2" fill="#FFFFFF" />
      <path d="M 45,48 V 44 C 45,41 55,41 55,44 V 48" stroke="#FFFFFF" strokeWidth="2.5" fill="none" />
      <circle cx="50" cy="54" r="1.5" fill="#E11D48" />
      {/* Question marks */}
      <text x="18" y="30" fill="#E11D48" fontSize="16" fontWeight="bold" transform="rotate(-15 18 30)">?</text>
      <text x="82" y="32" fill="#F43F5E" fontSize="14" fontWeight="bold" transform="rotate(20 82 32)">?</text>
    </svg>
  )
}

function BoySpeakingSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#FEF3C7" />
      {/* Megaphone/Speaker */}
      <path d="M 32,44 H 42 L 54,34 V 66 L 42,56 H 32 C 30,56 28,54 28,52 V 48 C 28,46 30,44 32,44 Z" fill="#D97706" />
      {/* Chaotic / jagged speech waves */}
      <path d="M 62,40 Q 68,44 62,50 Q 68,56 62,60" fill="none" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 70,34 Q 78,42 70,50 Q 78,58 70,66" fill="none" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      {/* Warning symbol badge */}
      <circle cx="50" cy="50" r="10" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d="M 50,45 V 51 M 50,55 H 50" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function GirlScribbleSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#E0E7FF" />
      {/* Brain Silhouette */}
      <path d="M 34,48 C 30,48 26,52 26,58 C 26,64 32,68 38,68 C 40,68 42,66 44,64 C 46,66 48,68 50,68 C 52,68 54,66 56,64 C 58,66 60,68 62,68 C 68,68 74,64 74,58 C 74,52 70,48 66,48 C 66,42 62,38 56,38 C 54,38 52,40 50,42 C 48,40 46,38 40,38 C 34,38 34,42 34,48 Z" fill="#C7D2FE" stroke="#4338CA" strokeWidth="2.5" />
      {/* Floating puzzle piece */}
      <path d="M 64,36 H 72 V 44 H 64 Z" fill="#818CF8" stroke="#4338CA" strokeWidth="1.5" transform="rotate(15 68 40) translate(2, -8)" />
      {/* Puzzle cut-out hole in brain */}
      <rect x="56" y="42" width="8" height="8" fill="#E0E7FF" stroke="#4338CA" strokeWidth="1.5" strokeDasharray="2 2" />
      {/* Clock overlay */}
      <circle cx="50" cy="54" r="12" fill="#FFFFFF" stroke="#4338CA" strokeWidth="2" />
      <path d="M 50,46 V 54 H 56" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" />
      {/* Vanishing squiggly lines */}
      <path d="M 76,28 A 12,12 0 0,0 66,20" fill="none" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  )
}

function BoyLaptopSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#E0F2FE" />
      {/* Globe grid on background */}
      <circle cx="50" cy="42" r="16" fill="none" stroke="#BAE6FD" strokeWidth="2" />
      <line x1="34" y1="42" x2="66" y2="42" stroke="#BAE6FD" strokeWidth="2" />
      {/* Laptop base and screen */}
      <rect x="28" y="46" width="44" height="26" rx="3" fill="#FFFFFF" stroke="#0369A1" strokeWidth="2.5" />
      <rect x="32" y="50" width="36" height="18" fill="#BAE6FD" />
      <path d="M 22,72 H 78 L 74,78 H 26 Z" fill="#0284C7" />
      {/* Red cross barrier / connection lost */}
      <path d="M 42,32 L 58,48 M 58,32 L 42,48" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="50" cy="40" r="11" fill="none" stroke="#EF4444" strokeWidth="2.5" />
    </svg>
  )
}

function BoyBoredSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#D1FAE5" />
      {/* Open Book */}
      <path d="M 26,58 C 36,58 46,54 46,36 C 46,54 56,58 66,58 L 66,38 C 56,38 46,34 46,34 C 46,34 36,38 26,38 Z" fill="#FFFFFF" stroke="#047857" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Low Battery Indicator overlay */}
      <rect x="36" y="62" width="28" height="12" rx="3" fill="#FFFFFF" stroke="#EF4444" strokeWidth="2" />
      <rect x="39" y="65" width="6" height="6" rx="1" fill="#EF4444" />
      <rect x="65" y="65" width="2" height="6" fill="#EF4444" />
      {/* Boredom Sleep signals (zZz) */}
      <text x="56" y="28" fill="#047857" fontSize="12" fontWeight="black" transform="rotate(-10 56 28)">Z</text>
      <text x="68" y="22" fill="#059669" fontSize="16" fontWeight="black" transform="rotate(15 68 22)">Z</text>
      <text x="78" y="16" fill="#EF4444" fontSize="10" fontWeight="bold">z</text>
    </svg>
  )
}

// Section 2 Problems SVGs (High-Fidelity conceptual illustrations)
function TeenLostRootSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      {/* Base book */}
      <path d="M 28,60 C 40,60 50,55 50,30 C 50,55 60,60 72,60 L 72,35 C 60,35 50,30 50,30 C 50,30 40,35 28,35 Z" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Root/Anchor silhouette */}
      <path d="M 50,42 V 68 M 42,62 A 10,10 0 0,0 58,62" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Broken indicator */}
      <path d="M 38,58 L 44,68" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 62,58 L 56,68" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
      {/* Small warning badge */}
      <circle cx="72" cy="28" r="9" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
      <text x="72" y="31.5" fill="#FFFFFF" fontSize="9" fontWeight="extrabold" textAnchor="middle">?</text>
    </svg>
  )
}

function TeenGrammarSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#FEE2E2" />
      {/* Tangled mesh / scribble */}
      <path d="M 30,50 C 30,35 45,30 50,45 C 55,60 70,55 70,50 C 70,40 55,30 45,40 C 35,50 50,65 60,60 C 70,55 65,40 55,35" fill="none" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 35,42 Q 50,58 65,42" fill="none" stroke="#B91C1C" strokeWidth="2" opacity="0.6" />
      {/* Tangled nodes or a central alert badge */}
      <circle cx="50" cy="46" r="11" fill="#FFFFFF" stroke="#B91C1C" strokeWidth="2.5" />
      {/* Jumbled characters inside badge */}
      <text x="50" y="52" fill="#B91C1C" fontSize="14" fontWeight="black" textAnchor="middle">?</text>
    </svg>
  )
}

function TeenListeningSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#FEF3C7" />
      {/* Ear silhouette */}
      <path d="M 38,46 C 38,30 56,22 58,34 C 58,38 52,40 50,46 C 48,50 50,56 46,58 C 42,60 38,54 38,46 Z" fill="#FFFFFF" stroke="#D97706" strokeWidth="2.5" />
      <path d="M 46,42 A 6,6 0 0,1 52,48" stroke="#D97706" strokeWidth="2" fill="none" />
      {/* Soundwaves blocked */}
      <path d="M 68,30 A 18,18 0 0,1 68,62" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M 76,22 A 28,28 0 0,1 76,70" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" fill="none" />
      {/* Red cross Mute symbol */}
      <path d="M 64,40 L 76,52 M 76,40 L 64,52" stroke="#EF4444" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}

function TeenShySVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#F5F3FF" />
      {/* Speech bubble */}
      <path d="M 30,35 H 70 C 75,35 79,39 79,44 V 54 C 79,59 75,63 70,63 H 42 L 30,71 V 63 H 28 C 23,63 19,59 19,54 V 44 C 19,39 23,35 28,35 Z" fill="#FFFFFF" stroke="#6D28D9" strokeWidth="2.5" />
      {/* Lock in center */}
      <rect x="43" y="47" width="14" height="10" rx="2" fill="#6D28D9" />
      <path d="M 46,47 V 43 C 46,40 54,40 54,43 V 47" stroke="#6D28D9" strokeWidth="2.5" fill="none" />
      <circle cx="50" cy="52" r="1.5" fill="#FFFFFF" />
    </svg>
  )
}

function TeenRepeatedSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#ECFDF5" />
      {/* Stack of books */}
      <rect x="30" y="45" width="40" height="10" rx="2" fill="#FFFFFF" stroke="#047857" strokeWidth="2" />
      <rect x="32" y="37" width="36" height="10" rx="2" fill="#FFFFFF" stroke="#047857" strokeWidth="2" />
      <rect x="35" y="29" width="30" height="10" rx="2" fill="#FFFFFF" stroke="#047857" strokeWidth="2" />
      {/* Circular repeat arrow around the stack */}
      <path d="M 20,45 A 32,32 0 1,1 80,45" fill="none" stroke="#F59E0B" strokeWidth="3" strokeDasharray="5 3" />
      <polygon points="76,46 84,46 80,41" fill="#F59E0B" />
      {/* Red Warning/Failure cross */}
      <circle cx="72" cy="28" r="9" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
      <path d="M 68,28 H 76" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TeenNoEnvironmentSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#F0FDFA" />
      {/* Globe outline */}
      <circle cx="50" cy="46" r="22" fill="#FFFFFF" stroke="#0F766E" strokeWidth="2.5" />
      <ellipse cx="50" cy="46" rx="8" ry="22" fill="none" stroke="#0F766E" strokeWidth="1.5" />
      <line x1="28" y1="46" x2="72" y2="46" stroke="#0F766E" strokeWidth="2" />
      {/* Lock overlay */}
      <rect x="42" y="52" width="16" height="12" rx="2" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d="M 45,52 V 48 C 45,45 55,45 55,48 V 52" stroke="#EF4444" strokeWidth="2" fill="none" />
    </svg>
  )
}

// Custom High-Fidelity SVGs to replace Lucide icons
function TalkBubbleSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#E0F2FE" />
      {/* Primary speech bubble */}
      <path d="M 28,38 H 68 C 73,38 77,42 77,47 V 59 C 77,64 73,68 68,68 H 42 L 30,76 V 68 H 28 C 23,68 19,64 19,59 V 47 C 19,42 23,38 28,38 Z" fill="#2563EB" />
      {/* Secondary overlay speech bubble */}
      <path d="M 45,26 H 75 C 79,26 82,29 82,33 V 43 C 82,47 79,50 75,50 H 68 L 60,56 V 50 H 45 C 41,50 38,47 38,43 V 33 C 38,29 41,26 45,26 Z" fill="#93C5FD" opacity="0.9" />
      {/* Speaking lines or dots inside bubbles */}
      <circle cx="38" cy="53" r="3" fill="#FFFFFF" />
      <circle cx="48" cy="53" r="3" fill="#FFFFFF" />
      <circle cx="58" cy="53" r="3" fill="#FFFFFF" />
    </svg>
  )
}

function FlexibleGlobeSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      {/* Globe grid */}
      <circle cx="50" cy="50" r="26" fill="none" stroke="#2563EB" strokeWidth="2.5" />
      <ellipse cx="50" cy="50" rx="12" ry="26" fill="none" stroke="#2563EB" strokeWidth="2" />
      <line x1="24" y1="50" x2="76" y2="50" stroke="#2563EB" strokeWidth="2.5" />
      <path d="M 27,37 H 73 M 27,63 H 73" stroke="#93C5FD" strokeWidth="2" />
      {/* Orbit ring representing flexibility */}
      <ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#10B981" strokeWidth="3" strokeDasharray="6,4" transform="rotate(-20 50 50)" />
      {/* Pin or Clock icon overlay */}
      <circle cx="72" cy="32" r="9" fill="#10B981" />
      <path d="M 72,27 V 32 H 76" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function ProgressChartSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#ECFDF5" />
      {/* Document page */}
      <rect x="28" y="24" width="44" height="52" rx="5" fill="#FFFFFF" stroke="#10B981" strokeWidth="2.5" />
      {/* Lines on page */}
      <line x1="36" y1="36" x2="64" y2="36" stroke="#D1FAE5" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="36" y1="46" x2="56" y2="46" stroke="#D1FAE5" strokeWidth="3.5" strokeLinecap="round" />
      {/* Bar Chart inside document */}
      <rect x="36" y="56" width="6" height="12" fill="#EF4444" rx="1.5" />
      <rect x="46" y="52" width="6" height="16" fill="#FBBF24" rx="1.5" />
      <rect x="56" y="46" width="6" height="22" fill="#10B981" rx="1.5" />
      {/* Green check badge overlay */}
      <circle cx="74" cy="74" r="11" fill="#10B981" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M 69,74 L 72,77 L 79,70" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// Why choose mockups SVGs (Colorful, High-Fidelity Cartoon Illustrations)
function TeacherFlagSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#E0F2FE" />
      {/* Globe lines */}
      <circle cx="48" cy="46" r="22" fill="none" stroke="#93C5FD" strokeWidth="2" />
      <ellipse cx="48" cy="46" rx="8" ry="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
      <line x1="26" y1="46" x2="70" y2="46" stroke="#93C5FD" strokeWidth="2" />
      {/* Graduation Cap */}
      <path d="M 24,44 L 48,34 L 72,44 L 48,54 Z" fill="#2563EB" stroke="#1D4ED8" strokeWidth="2" />
      <path d="M 38,49 V 58 C 38,62 58,62 58,58 V 49" fill="#1D4ED8" />
      <path d="M 68,45 V 56 L 70,58 L 72,56 V 45" fill="#FBBF24" />
      {/* Philippines Flag Seal Badge */}
      <circle cx="70" cy="68" r="14" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1.5" />
      <clipPath id="flag-clip">
        <circle cx="70" cy="68" r="13.5" />
      </clipPath>
      <g clipPath="url(#flag-clip)">
        {/* Blue top */}
        <rect x="56" y="54" width="28" height="14" fill="#0038A8" />
        {/* Red bottom */}
        <rect x="56" y="68" width="28" height="14" fill="#CE1126" />
        {/* White triangle on left */}
        <polygon points="56,54 72,68 56,82" fill="#FFFFFF" />
        {/* Sun in center of triangle */}
        <circle cx="62" cy="68" r="2.5" fill="#FBBF24" />
        <circle cx="59" cy="64" r="0.8" fill="#FBBF24" />
        <circle cx="59" cy="72" r="0.8" fill="#FBBF24" />
      </g>
    </svg>
  )
}

function KidsStudyingSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#FEF3C7" />
      {/* Silhouette 1: Teacher/Mentor (Blue) */}
      <path d="M 26,72 C 26,60 34,54 44,54 C 54,54 62,60 62,72 Z" fill="#2563EB" />
      <circle cx="44" cy="42" r="9" fill="#2563EB" />
      {/* Silhouette 2: Student/Learner (Orange/Amber) */}
      <path d="M 48,72 C 48,64 54,60 62,60 C 70,60 76,64 76,72 Z" fill="#F59E0B" />
      <circle cx="62" cy="48" r="7" fill="#F59E0B" />
      {/* Spark or learning bridge connecting them */}
      <path d="M 46,38 C 50,38 54,42 54,46 C 54,42 58,38 62,38 C 58,38 54,34 54,30 C 54,34 50,38 46,38 Z" fill="#F59E0B" />
      <path d="M 38,30 C 40,30 42,32 42,34 C 42,32 44,30 46,30 C 44,30 42,28 42,26 C 42,28 40,30 38,30 Z" fill="#2563EB" opacity="0.8" />
    </svg>
  )
}

function OpenBookSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#E0F2FE" />
      {/* Book outline and pages */}
      <path d="M 20,64 C 34,64 48,58 48,32 C 48,58 62,64 76,64 L 76,36 C 62,36 48,30 48,30 C 48,30 34,36 20,36 Z" fill="#FFFFFF" stroke="#2563EB" strokeWidth="3" strokeLinejoin="round" />
      <path d="M 18,66 C 34,66 48,60 48,34 C 48,60 62,66 78,66" stroke="#1D4ED8" strokeWidth="2.5" fill="none" />
      {/* Text lines */}
      <path d="M 24,42 L 42,42 M 24,48 L 42,48 M 24,54 L 42,54 M 54,42 L 72,42 M 54,48 L 72,48 M 54,54 L 72,54" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
      {/* Red Ribbon Bookmark */}
      <path d="M 48,30 L 48,46 L 51,43 L 54,46 L 54,30" fill="#EF4444" />
    </svg>
  )
}

function GamepadSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      {/* Blue Controller body */}
      <rect x="24" y="34" width="52" height="32" rx="10" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="2.5" />
      <circle cx="32" cy="50" r="8" fill="#2563EB" />
      <circle cx="68" cy="50" r="8" fill="#2563EB" />
      {/* D-Pad */}
      <path d="M 32,42 L 36,42 L 36,46 L 40,46 L 40,50 L 36,50 L 36,54 L 32,54 L 32,50 L 28,50 L 28,46 L 32,46 Z" fill="#FFFFFF" />
      {/* Buttons */}
      <circle cx="62" cy="46" r="3.5" fill="#EF4444" /> {/* Red */}
      <circle cx="68" cy="52" r="3.5" fill="#FBBF24" /> {/* Yellow */}
      <circle cx="62" cy="52" r="3.5" fill="#10B981" /> {/* Green */}
      <circle cx="68" cy="46" r="3.5" fill="#A7F3D0" opacity="0" />
      {/* Select/Start */}
      <rect x="44" y="52" width="5" height="2" rx="0.5" fill="#FFFFFF" />
      <rect x="51" y="52" width="5" height="2" rx="0.5" fill="#FFFFFF" />
    </svg>
  )
}

function ClipboardSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#ECFDF5" />
      {/* Clipboard base */}
      <rect x="30" y="26" width="40" height="50" rx="4" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="2.5" />
      {/* Paper sheet */}
      <rect x="34" y="32" width="32" height="40" rx="2" fill="#FFFFFF" />
      {/* Clip */}
      <rect x="42" y="22" width="16" height="7" rx="2" fill="#94A3B8" stroke="#64748B" strokeWidth="1" />
      <circle cx="50" cy="25" r="1.5" fill="#475569" />
      {/* Chart bars */}
      <rect x="38" y="58" width="6" height="10" fill="#EF4444" rx="1" />
      <rect x="47" y="50" width="6" height="18" fill="#10B981" rx="1" />
      <rect x="56" y="44" width="6" height="24" fill="#3B82F6" rx="1" />
      <path d="M 38,40 L 62,40 M 38,46 L 52,46" stroke="#E2E8F0" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function ShieldSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20 select-none drop-shadow-sm">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      {/* Shield Graphic */}
      <path d="M 30,30 L 50,22 L 70,30 C 70,52 50,68 50,68 C 50,68 30,52 30,30 Z" fill="#2563EB" stroke="#1D4ED8" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="46" r="14" fill="#FFFFFF" />
      <path d="M 44,46 L 48,50 L 56,40" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


// Section 3 Adult Problems SVGs
function AdultNoReflexSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#FFFBEB" />
      <path d="M 35,35 Q 50,25 65,35 Q 50,55 35,35 Z" fill="#D97706" />
      {/* Speech lines blocked */}
      <path d="M 35,50 L 65,50" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      <text x="50" y="80" fill="#D97706" fontSize="9" fontWeight="bold" textAnchor="middle">KHÔNG PHẢN XẠ</text>
    </svg>
  )
}

function AdultMeetingShySVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      {/* Table outline */}
      <ellipse cx="50" cy="56" rx="22" ry="12" fill="#3B82F6" />
      {/* Shy speaker hiding */}
      <circle cx="50" cy="42" r="8" fill="#DBEAFE" />
      <path d="M 46,42 Q 50,45 54,42" stroke="#1E293B" strokeWidth="1.5" fill="none" />
      <text x="50" y="80" fill="#1D4ED8" fontSize="9" fontWeight="bold" textAnchor="middle">NGẠI HỌP</text>
    </svg>
  )
}

function AdultNoIdeaSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#FFF1F2" />
      {/* Unlit/Cracked bulb */}
      <path d="M 40,42 C 40,30 60,30 60,42 C 60,48 54,50 54,54 L 46,54 C 46,50 40,48 40,42 Z" fill="#F1F5F9" stroke="#E11D48" strokeWidth="2" />
      <rect x="46" y="55" width="8" height="4" fill="#94A3B8" />
      <path d="M 35,42 L 65,42" stroke="#E11D48" strokeWidth="1.5" strokeDasharray="3,3" />
      <text x="50" y="80" fill="#E11D48" fontSize="9" fontWeight="bold" textAnchor="middle">BÍ Ý TƯỞNG</text>
    </svg>
  )
}

function AdultNoPromotionSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#F5F3FF" />
      {/* Stairs */}
      <path d="M 30,62 L 42,62 L 42,50 L 54,50 L 54,38 L 66,38" stroke="#7C3AED" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Red block sign */}
      <circle cx="54" cy="38" r="5" fill="#EF4444" />
      <line x1="51" y1="38" x2="57" y2="38" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="50" y="80" fill="#7C3AED" fontSize="9" fontWeight="bold" textAnchor="middle">MẤT CƠ HỘI</text>
    </svg>
  )
}

function AdultNoEnvSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-sm select-none">
      <circle cx="50" cy="50" r="44" fill="#ECFDF5" />
      {/* Speaking head with lock */}
      <circle cx="45" cy="46" r="14" fill="#A7F3D0" />
      <rect x="52" y="42" width="14" height="14" rx="2" fill="#10B981" />
      <circle cx="59" cy="46" r="2" fill="#FFFFFF" />
      <path d="M 55,42 L 55,38 A 4,4 0 0,1 63,38 L 63,42" fill="none" stroke="#10B981" strokeWidth="2" />
      <text x="50" y="80" fill="#047857" fontSize="9" fontWeight="bold" textAnchor="middle">THIẾU LUYỆN NÓI</text>
    </svg>
  )
}

// Section 3 Program SVGs
function OfficeProgSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16 select-none">
      <circle cx="50" cy="50" r="44" fill="#EFF6FF" />
      <rect x="34" y="24" width="32" height="52" rx="3" fill="#3B82F6" />
      <rect x="40" y="30" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
      <rect x="54" y="30" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
      <rect x="40" y="42" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
      <rect x="54" y="42" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
      <rect x="40" y="54" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
      <rect x="54" y="54" width="6" height="6" fill="#FFFFFF" opacity="0.8" />
    </svg>
  )
}

function MeetingProgSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16 select-none">
      <circle cx="50" cy="50" r="44" fill="#FFF8E7" />
      <path d="M 28,66 C 28,52 38,46 50,46 C 62,46 72,52 72,66 Z" fill="#D97706" />
      <circle cx="50" cy="34" r="10" fill="#F59E0B" />
      <path d="M 34,42 Q 50,22 66,42" stroke="#D97706" strokeWidth="2" fill="none" />
    </svg>
  )
}

function ClientProgSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16 select-none">
      <circle cx="50" cy="50" r="44" fill="#E6FBF2" />
      <circle cx="50" cy="46" r="18" fill="#10B981" />
      <path d="M 30,62 C 30,50 40,46 50,46 C 60,46 70,50 70,62 Z" fill="#047857" />
      <circle cx="50" cy="34" r="8" fill="#FFFFFF" />
      <path d="M 36,44 Q 50,24 64,44" stroke="#FFFFFF" strokeWidth="2" fill="none" />
    </svg>
  )
}

export function LoginPage() {
  const getLandingType = () => {
    const envType = import.meta.env.VITE_LANDING_TYPE
    if (envType === 'kids' || envType === 'teens' || envType === 'adults') {
      return envType
    }
    const hostname = window.location.hostname.toLowerCase()
    if (hostname.includes('kids')) return 'kids'
    if (hostname.includes('teens') || hostname.includes('mat-goc')) return 'teens'
    if (hostname.includes('adult') || hostname.includes('working')) return 'adults'
    
    const params = new URLSearchParams(window.location.search)
    const paramType = params.get('type')
    if (paramType === 'kids' || paramType === 'teens' || paramType === 'adults') {
      return paramType
    }
    return 'kids'
  }

  const landingType = getLandingType()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const { lang, setLang, t } = useLanguageStore()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('login') === 'true' || params.get('login') === 'teacher') {
      setLoginRole('teacher')
    } else if (params.get('login') === 'admin') {
      setLoginRole('admin')
    }
  }, [])
  
  // Modals state
  const [loginRole, setLoginRole] = useState<'teacher' | 'admin' | null>(null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [studentCode, setStudentCode] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'tre-em' | 'mat-goc' | 'nguoi-di-lam'>('tre-em')

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // FAQ state
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null)
  const [faqMatGocIndex, setFaqMatGocIndex] = useState<number | null>(null)
  const [faqNguoiDiLamIndex, setFaqNguoiDiLamIndex] = useState<number | null>(null)

  // Form states
  const [formTreEm, setFormTreEm] = useState({ parentName: '', phone: '', kidName: '', kidAge: '5-6' })
  const [formBottomTreEm, setFormBottomTreEm] = useState({ parentName: '', phone: '', kidAge: '5-6' })
  const [formNguoiDiLam, setFormNguoiDiLam] = useState({ name: '', phone: '', objectives: [] as string[] })
  const [formBottomNguoiDiLam, setFormBottomNguoiDiLam] = useState({ phone: '' })

  // Wheel of Fortune State
  const [spinning, setSpinning] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [spinCount, setSpinCount] = useState(0)
  const [showPrizeModal, setShowPrizeModal] = useState(false)
  const [prizeIndex, setPrizeIndex] = useState<number | null>(null)
  const [claimPhone, setClaimPhone] = useState('')
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [hasSpun, setHasSpun] = useState(false)

  const sectors = [
    { labelLines: ['Voucher', '500.000đ'], color: '#FFF1F2', textColor: '#E11D48', border: '#FDA4AF' }, // Red-rose
    { labelLines: ['Voucher', '300.000đ'], color: '#FEF3C7', textColor: '#D97706', border: '#FDE68A' }, // Amber
    { labelLines: ['Voucher', '200.000đ'], color: '#ECFDF5', textColor: '#059669', border: '#A7F3D0' }, // Emerald
    { labelLines: ['01 Buổi Học', 'Miễn Phí'], color: '#EFF6FF', textColor: '#2563EB', border: '#BFDBFE' }, // Blue
    { labelLines: ['02 Buổi Học', 'Miễn Phí'], color: '#F5F3FF', textColor: '#7C3AED', border: '#DDD6FE' }, // Purple
    { labelLines: ['Quà Tặng', 'Đặc Biệt'], color: '#FDF2F8', textColor: '#DB2777', border: '#FBCFE8' }  // Pink
  ]

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
    reset: resetLoginForm
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) })

  // Active section highlights on scroll
  useEffect(() => {
    const handleScroll = () => {
      const treEmEl = document.getElementById('trang-chu')
      const matGocEl = document.getElementById('mat-goc')
      const nguoiDiLamEl = document.getElementById('nguoi-di-lam')
      
      const scrollPos = window.scrollY + 280

      if (nguoiDiLamEl && scrollPos >= nguoiDiLamEl.offsetTop) {
        setActiveSection('nguoi-di-lam')
      } else if (matGocEl && scrollPos >= matGocEl.offsetTop) {
        setActiveSection('mat-goc')
      } else if (treEmEl) {
        setActiveSection('tre-em')
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const formatEmail = (username: string) => {
    if (!username.includes('@')) return `${username}@edutrackpro.app`
    return username
  }

  const onLogin = async (data: LoginData) => {
    setErrorMsg('')
    try {
      let result
      
      if (loginRole === 'teacher') {
        result = await signInTeacher(data.username, data.password)
      } else {
        const emailToUse = formatEmail(data.username)
        result = await signIn(emailToUse, data.password)
      }
      
      const { role } = result
      
      if (role === 'admin') navigate('/admin/dashboard')
      else if (role === 'teacher') navigate('/teacher/attendance')
      else if (role === 'guest') navigate('/waiting')
      else setErrorMsg('Tài khoản không có quyền truy cập')
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-email') || msg.includes('Mật khẩu không đúng') || msg.includes('Mã giáo viên không tồn tại')) {
        setErrorMsg('Mã giáo viên hoặc mật khẩu không đúng')
      } else if (msg.includes('too-many-requests')) {
        setErrorMsg('Quá nhiều lần thử. Vui lòng thử lại sau.')
      } else if (msg.includes('không có quyền') || msg.includes('does not have access')) {
        setErrorMsg('Tài khoản không có quyền truy cập')
      } else if (msg.includes('chưa được kích hoạt')) {
        setErrorMsg(msg)
      } else {
        setErrorMsg('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    }
  }

  const handleSearchProgress = () => {
    if (!studentCode.trim()) return
    setShowSearchModal(false)
    navigate(`/parent?code=${encodeURIComponent(studentCode.trim())}`)
  }

  const toggleLang = () => setLang(lang === 'vi' ? 'en' : 'vi')

  const openLogin = (role: 'teacher' | 'admin') => {
    setLoginRole(role)
    setErrorMsg('')
    resetLoginForm()
  }

  const handleSignupSubmit = (e: React.FormEvent, programName: string) => {
    e.preventDefault()
    setSuccessMsg(`Đăng ký học thử thành công chương trình "${programName}"! Trung tâm 123English sẽ liên hệ với phụ huynh / học sinh qua số điện thoại cung cấp trong vòng 15-30 phút để kiểm tra trình độ và lên lịch học thử miễn phí.`)
  }

  const handleSpin = () => {
    if (spinning || hasSpun) return
    setSpinning(true)
    setClaimSuccess(false)
    setClaimPhone('')
    
    const randomIndex = Math.floor(Math.random() * sectors.length)
    setPrizeIndex(randomIndex)

    const nextSpinCount = spinCount + 6
    setSpinCount(nextSpinCount)
    
    // Rotate to position sector center at 12 o'clock pointer (270 degrees in SVG coordinate)
    const targetRotation = nextSpinCount * 360 + 270 - (randomIndex * 60 + 30)
    setWheelRotation(targetRotation)

    setTimeout(() => {
      setSpinning(false)
      setHasSpun(true)
      setShowPrizeModal(true)
    }, 4000)
  }

  const handleClaimPrizeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!claimPhone.trim()) return
    setClaimSuccess(true)
    setTimeout(() => {
      setShowPrizeModal(false)
      setSuccessMsg(`Chúc mừng bạn đã nhận phần quà "${sectors[prizeIndex!].labelLines.join(' ')}"! Mã ưu đãi sẽ được gửi đến số điện thoại ${claimPhone} sau ít phút. Nhân viên hỗ trợ sẽ liên hệ để kích hoạt đặc quyền học thử của bạn.`)
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#FFFDF7] overflow-x-hidden font-jakarta relative selection:bg-[#10B981]/30 selection:text-slate-900">
      
      {/* 1. NAV BAR (MATCHES MOCKUP HEADER) */}
      <nav className="bg-white border-b border-slate-100 py-3 px-4 sm:px-6 md:px-12 lg:px-20 sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo with clean typography */}
          <div className="flex flex-col">
            <Link to="/login" className="flex items-center gap-1">
              <span className="font-quicksand font-extrabold text-2xl tracking-tight flex">
                <span className="text-[#FBBF24]">1</span>
                <span className="text-[#F97316]">2</span>
                <span className="text-[#2563EB]">3</span>
                <span className="text-[#2563EB] ml-1">ENGLISH</span>
              </span>
            </Link>
            <span className="text-[9px] font-black text-[#10B981] tracking-wider font-quicksand leading-none uppercase mt-0.5">
              {landingType === 'kids' && 'TIẾNG ANH TRẺ EM (5-12 TUỔI)'}
              {landingType === 'teens' && 'TIẾNG ANH MẤT GỐC & THIẾU NIÊN (13-18 TUỔI)'}
              {landingType === 'adults' && 'TIẾNG ANH CHO NGƯỜI ĐI LÀM'}
            </span>
          </div>

          {/* Navigation Menu (Mockup Menu Links) */}
          <div className="hidden lg:flex items-center gap-7 xl:gap-8 font-quicksand font-bold text-[14px] text-slate-800">
            <a 
              href="#trang-chu" 
              className={`pb-1 border-b-2 transition-all duration-200 ${activeSection === 'tre-em' ? 'border-[#10B981] text-[#10B981]' : 'border-transparent hover:text-[#10B981]'}`}
            >
              Trang chủ
            </a>
            <a 
              href="#van-de" 
              className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
            >
              Vấn đề
            </a>
            <a 
              href="#chuong-trinh" 
              className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
            >
              Chương trình
            </a>
            {landingType === 'kids' && (
              <a 
                href="#lo-trinh" 
                className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
              >
                Lộ trình
              </a>
            )}
            {landingType === 'teens' && (
              <a 
                href="#mat-goc-quay" 
                className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
              >
                Quay thưởng
              </a>
            )}
            {landingType === 'adults' && (
              <a 
                href="#dao-tao" 
                className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
              >
                Đào tạo
              </a>
            )}
            <a 
              href="#danh-gia" 
              className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
            >
              Đánh giá
            </a>
            <a 
              href="#cau-hoi" 
              className="pb-1 border-b-2 border-transparent hover:text-[#10B981] transition-all duration-200"
            >
              Câu hỏi
            </a>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4">
            <a 
              href="#dang-ky-form"
              className={`hidden sm:inline-flex items-center gap-1 px-4.5 py-2.5 text-white shadow-md rounded-full transition-all duration-300 font-quicksand font-extrabold text-[11px] uppercase tracking-wider ${
                landingType === 'kids' ? 'bg-[#10B981] hover:bg-[#0d9468]' :
                landingType === 'teens' ? 'bg-[#2563EB] hover:bg-[#1d4ed8]' :
                'bg-[#F97316] hover:bg-[#ea580c]'
              }`}
            >
              Đăng ký học thử miễn phí &gt;
            </a>
            
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2.5 font-quicksand font-bold text-sm text-slate-700 animate-slide-up">
            <a href="#trang-chu" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
              <span>Trang chủ</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
            <a href="#van-de" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
              <span>Vấn đề</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
            <a href="#chuong-trinh" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
              <span>Chương trình học</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
            {landingType === 'kids' && (
              <a href="#lo-trinh" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
                <span>Lộ trình</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </a>
            )}
            {landingType === 'teens' && (
              <a href="#mat-goc-quay" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
                <span>Quay thưởng</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </a>
            )}
            {landingType === 'adults' && (
              <a href="#dao-tao" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
                <span>Đào tạo</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </a>
            )}
            <a href="#danh-gia" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
              <span>Đánh giá</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
            <a href="#cau-hoi" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 hover:bg-slate-50 rounded-xl flex items-center justify-between">
              <span>Câu hỏi</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
          </div>
        )}
      </nav>

      {landingType === 'kids' && (
        <>
          {/* ========================================================================= */}
          {/* MEGA-SECTION 1: TIẾNG ANH TRẺ EM (AGES 5-12) - IMAGE 1                    */}
          {/* ========================================================================= */}
          <section id="trang-chu" className="pt-8 pb-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-gradient-to-b from-[#FFFBF0] via-white to-white relative overflow-hidden">
            
            {/* Decorative background stars */}
            <div className="absolute top-10 left-[45%] text-yellow-300 font-bold text-3xl animate-bounce pointer-events-none select-none">★</div>
            <div className="absolute top-32 left-10 text-yellow-200 font-bold text-xl pointer-events-none select-none">✦</div>
        
        {/* Hero 3-Column Desktop Grid */}
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[37%_33%_30%] gap-6 items-center">
          
          {/* Column 1: Left Text & Bullets & Mascot */}
          <div className="relative z-10 flex flex-col justify-center h-full">
            <div className="self-start px-4 py-1.5 bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] font-quicksand font-bold text-xs rounded-full uppercase tracking-wider shadow-sm mb-6">
              Tiếng Anh Trẻ Em 5-12 Tuổi
            </div>
            
            <h1 className="font-quicksand font-extrabold text-3xl sm:text-4xl lg:text-[40px] leading-[1.15] text-slate-800 tracking-tight">
              TỰ TIN GIAO TIẾP TIẾNG ANH<br />
              <span className="inline-flex items-center gap-2 text-[#10B981] font-extrabold py-1 my-1">
                <span className="w-1.5 h-8 bg-[#10B981] rounded-full inline-block" /> 1 KÈM 1 CÙNG
              </span><br />
              <span className="text-[#10B981] font-black drop-shadow-sm font-quicksand uppercase">GIÁO VIÊN PHILIPPINES</span>
            </h1>

            {/* Bullet points with circular green checkmark */}
            <ul className="mt-6 space-y-3.5 font-jakarta font-semibold text-slate-600 text-sm">
              {[
                'Học 1 kèm 1 cá nhân hóa theo trình độ của bé',
                'Giáo viên Philippines phát âm chuẩn, nhiệt tình',
                'Học online tại nhà, linh hoạt thời gian',
                'Tiến bộ rõ rệt sau từng buổi học'
              ].map((bullet, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-5 h-5 bg-[#10B981] text-white rounded-full flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {/* Mascot dog waving at bottom-left */}
            <div className="mt-8 flex items-center gap-4 relative">
              <div className="w-20 h-20 select-none">
                <img src="/logo.png" alt="Mascot Husky" className="w-full h-full object-contain" />
              </div>
              <div className="relative">
                <div className="absolute top-0 left-0 w-16 h-12 border-t-2 border-dashed border-yellow-300 rounded-tl-full opacity-60"></div>
                <div className="text-[10px] font-black text-slate-400 font-quicksand uppercase tracking-wider pl-4 pt-4">LỚP HỌC HÀNG ĐẦU VIỆT NAM</div>
              </div>
            </div>
          </div>

          {/* Column 2: Center Image with Overlapping details */}
          <div className="relative flex justify-center items-center py-6 lg:py-0">
            {/* Background book details */}
            <div className="absolute -bottom-4 left-6 bg-gradient-to-br from-amber-400 to-orange-500 w-10 h-10 rounded-2xl flex items-center justify-center text-white font-outfit font-black text-lg shadow-lg rotate-12 select-none z-10">A</div>
            <div className="absolute -bottom-5 right-20 bg-gradient-to-br from-emerald-400 to-teal-500 w-8 h-8 rounded-2xl flex items-center justify-center text-white font-outfit font-black text-base shadow-lg -rotate-12 select-none z-10">B</div>
            <div className="absolute top-16 left-0 bg-gradient-to-br from-blue-400 to-indigo-500 w-9 h-9 rounded-2xl flex items-center justify-center text-white font-outfit font-black text-base shadow-lg rotate-45 select-none z-10">C</div>
            
            {/* Comic Speech Bubble */}
            <div className="absolute top-2 right-4 bg-white px-4 py-2 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-1.5 animate-bounce z-10">
              <span className="text-[10px] font-black text-[#2563EB] tracking-wide uppercase font-quicksand">Let's learn English!</span>
            </div>

            {/* Main Kid Image */}
            <div className="rounded-[2.5rem] overflow-hidden border-[6px] border-white shadow-2xl bg-[#FEFBF2] max-w-[340px] w-full relative">
              <img 
                src="/hero1.png" 
                alt="Bé học tiếng anh online" 
                className="w-full h-auto object-cover object-center max-h-[310px]"
              />
            </div>
          </div>

          {/* Column 3: Right SignUp Card */}
          <div id="dang-ky-form" className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-2xl relative">
            <h3 className="font-quicksand font-extrabold text-lg text-center text-slate-800 uppercase tracking-tight">
              ĐĂNG KÝ HỌC THỬ<br />
              <span className="text-[#10B981] font-black">MIỄN PHÍ</span>
            </h3>
            
            <div className="mt-4 space-y-2 font-jakarta font-bold text-[10px] text-slate-500 bg-slate-50 p-3.5 rounded-2xl border border-slate-100/50">
              {[
                'Kiểm tra trình độ miễn phí',
                'Học thử 1 kèm 1 cùng giáo viên',
                'Nhận lộ trình cá nhân hóa'
              ].map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 bg-[#FBBF24] text-white rounded-full flex items-center justify-center text-[9px] font-black shrink-0">
                    ✓
                  </span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            <form onSubmit={(e) => handleSignupSubmit(e, 'Tiếng Anh Trẻ Em (Hero)')} className="space-y-3 mt-4">
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  required
                  value={formTreEm.parentName}
                  onChange={(e) => setFormTreEm({...formTreEm, parentName: e.target.value})}
                  placeholder="Họ và tên phụ huynh *"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:bg-white transition-all font-medium"
                />
              </div>
              
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="tel" 
                  required
                  value={formTreEm.phone}
                  onChange={(e) => setFormTreEm({...formTreEm, phone: e.target.value})}
                  placeholder="Số điện thoại liên hệ *"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="relative">
                <Heart className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  required
                  value={formTreEm.kidName}
                  onChange={(e) => setFormTreEm({...formTreEm, kidName: e.target.value})}
                  placeholder="Tên của bé *"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="relative">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <select 
                  value={formTreEm.kidAge}
                  onChange={(e) => setFormTreEm({...formTreEm, kidAge: e.target.value})}
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-[#10B981] focus:bg-white transition-all font-medium appearance-none"
                >
                  <option value="5-6">Độ tuổi của bé: 5 - 6 tuổi</option>
                  <option value="7-9">Độ tuổi của bé: 7 - 9 tuổi</option>
                  <option value="10-12">Độ tuổi của bé: 10 - 12 tuổi</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <button 
                type="submit"
                className="w-full py-3.5 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-extrabold rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center gap-1 text-xs uppercase tracking-wider"
              >
                ĐĂNG KÝ HỌC THỬ NGAY &gt;
              </button>
            </form>

            <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-bold bg-slate-50 py-2 rounded-lg border border-slate-100/50">
              <ShieldCheck className="w-3 h-3 text-[#10B981]" />
              THÔNG TIN ĐƯỢC BẢO MẬT TUYỆT ĐỐI
            </div>
          </div>

        </div>

        {/* 3. KEY STATS ROW (Mockup Clean Row) */}
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 bg-white/60 p-5 rounded-[2rem] border border-slate-100 shadow-sm relative z-10">
          {[
            { val: '5+', title: 'Năm kinh nghiệm', desc: 'đào tạo Tiếng Anh trẻ em', icon: ShieldCheck, color: 'text-rose-500 bg-rose-50' },
            { val: '100+', title: 'Giáo viên Philippines', desc: 'được tuyển chọn kỹ lưỡng', icon: Users, color: 'text-amber-500 bg-amber-50' },
            { val: '10.000+', title: 'Giờ học', desc: 'đã hoàn thành xuất sắc', icon: Award, color: 'text-blue-500 bg-blue-50' },
            { val: 'Học viên', title: 'tại mọi tỉnh thành', desc: 'học trực tuyến toàn quốc', icon: Globe, color: 'text-emerald-500 bg-emerald-50' }
          ].map((stat, idx) => (
            <div key={idx} className="text-center p-2 border-r last:border-0 border-slate-100 flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-1.5 shadow-sm ${stat.color}`}>
                <stat.icon className="w-4.5 h-4.5" />
              </div>
              <div className="font-quicksand font-extrabold text-xl lg:text-2xl text-slate-800 leading-none">{stat.val}</div>
              <div className="font-bold text-[11px] text-slate-700 mt-1">{stat.title}</div>
              <div className="text-[9px] text-slate-400 font-bold leading-snug">{stat.desc}</div>
            </div>
          ))}        </div>
      </section>
      {/* 4. SECTION: BÉ CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? */}
      <section id="van-de" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-1.5 uppercase">
            <span className="text-[#FBBF24]">✦</span> BÉ CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? <span className="text-[#FBBF24]">✦</span>
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-10">
            {[
              { title: 'Ngại nói tiếng Anh, thiếu tự tin', svg: GirlThinkingSVG },
              { title: 'Phát âm chưa chuẩn, khó nghe hiểu', svg: BoySpeakingSVG },
              { title: 'Học trước quên sau, khó ghi nhớ', svg: GirlScribbleSVG },
              { title: 'Thiếu môi trường giao tiếp thực tế', svg: BoyLaptopSVG },
              { title: 'Không hứng thú, dễ chán khi học', svg: BoyBoredSVG }
            ].map((prob, idx) => (
              <div key={idx} className="bg-gradient-to-b from-white to-[#FFFDF9] p-6 rounded-[2rem] border border-orange-100/60 hover:border-[#FBBF24]/60 shadow-[0_4px_20px_-4px_rgba(251,191,36,0.08)] hover:shadow-[0_20px_35px_-8px_rgba(251,191,36,0.15)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                <div className="mb-5 transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-2">
                  <prob.svg />
                </div>
                <h4 className="font-quicksand font-extrabold text-xs sm:text-[13px] text-slate-700 leading-relaxed max-w-[150px]">{prob.title}</h4>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 5. SECTION: VÌ SAO PHỤ HUYNH CHỌN 123ENGLISH? */}
      <section id="chuong-trinh" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-[#FFFDF7] border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-1">
            VÌ SAO PHỤ HUYNH CHỌN 
            <span className="font-quicksand font-extrabold flex ml-1.5">
              <span className="text-[#FBBF24]">1</span>
              <span className="text-[#F97316]">2</span>
              <span className="text-[#2563EB]">3</span>
              <span className="text-[#2563EB] ml-0.5">ENGLISH</span>
            </span>?
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-10">
            {[
              { title: 'Giáo viên Philippines', desc: 'phát âm chuẩn, nhiệt tình', svg: TeacherFlagSVG },
              { title: '1 KÈM 1', desc: 'cá nhân hóa từng buổi học', svg: KidsStudyingSVG },
              { title: 'Giáo trình quốc tế', desc: 'Cambridge, Oxford chuẩn đầu ra', svg: OpenBookSVG },
              { title: 'Học mà chơi', desc: 'tương tác thú vị, tăng hứng thú', svg: GamepadSVG },
              { title: 'Báo cáo tiến độ', desc: 'định kỳ cho phụ huynh', svg: ClipboardSVG },
              { title: 'Môi trường học', desc: 'an toàn, thân thiện, 100% online', svg: ShieldSVG }
            ].map((reason, idx) => (
              <div key={idx} className="bg-gradient-to-b from-white to-slate-50/50 p-6 rounded-[2rem] border border-emerald-100/40 hover:border-emerald-300/60 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.05)] hover:shadow-[0_20px_35px_-8px_rgba(16,185,129,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                <div className="mb-5 transform transition-all duration-500 group-hover:scale-110">
                  <reason.svg />
                </div>
                <h4 className="font-quicksand font-extrabold text-xs sm:text-[13px] text-slate-800 leading-tight">{reason.title}</h4>
                <p className="text-[10px] text-slate-400 font-bold mt-2 leading-relaxed max-w-[140px]">{reason.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 6. SECTION: LỘ TRÌNH HỌC CHO BÉ 5-12 TUỔI */}
      <section id="lo-trinh" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-1.5 uppercase">
            LỘ TRÌNH HỌC CHO BÉ <span className="text-[#10B981] font-extrabold">5-12 TUỔI</span>
          </h2>

          <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4 mt-10">
            {[
              { 
                age: '5 - 6 TUỔI', 
                level: 'STARTER', 
                points: ['Từ vựng cơ bản', 'Làm quen phát âm', 'Phản xạ nghe nói đơn giản', 'Màu sắc, số đếm, gia đình'],
                theme: 'border-[#10B981]/30 hover:border-[#10B981] text-[#10B981]', 
                badge: 'bg-[#ECFDF5] text-[#10B981] border-[#A7F3D0]', 
                img: '/starter_lion.png',
                arrow: true,
                arrowColor: 'text-[#10B981]'
              },
              { 
                age: '7 - 9 TUỔI', 
                level: 'MOVERS', 
                points: ['Mở rộng vốn từ vựng', 'Giao tiếp hằng ngày', 'Nghe hiểu cơ bản', 'Đặt câu hỏi, trả lời'],
                theme: 'border-[#F97316]/30 hover:border-[#F97316] text-[#D97706]', 
                badge: 'bg-[#FFF7ED] text-[#F97316] border-[#FDE68A]', 
                img: '/movers_elephant.png',
                arrow: true,
                arrowColor: 'text-slate-300'
              },
              { 
                age: '10 - 12 TUỔI', 
                level: 'FLYERS', 
                points: ['Giao tiếp tự tin hơn', 'Thuyết trình đơn giản', 'Đọc hiểu - viết cơ bản', 'Kể chuyện, miêu tả sự vật'],
                theme: 'border-[#2563EB]/30 hover:border-[#2563EB] text-[#2563EB]', 
                badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]', 
                img: '/flyers_giraffe.png',
                arrow: false,
                arrowColor: ''
              }
            ].map((path, idx) => (
              <div key={idx} className="flex-1 flex items-center gap-4">
                
                {/* Horizontal Card */}
                <div className={`flex-1 p-6 rounded-[2rem] border bg-white hover:shadow-xl transition-all duration-300 flex flex-row items-center gap-5 group ${path.theme}`}>
                  {/* Left Column: Mascot PNG */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center p-1 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                    <img src={path.img} alt={path.level} className="w-full h-full object-contain transform transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  
                  {/* Right Column: Syllabus points */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-0.5 rounded-full font-quicksand font-bold text-[10px] border ${path.badge}`}>{path.age}</span>
                        <span className="font-quicksand font-extrabold text-sm tracking-wide">{path.level}</span>
                      </div>
                      
                      <ul className="space-y-1.5 font-jakarta font-semibold text-xs text-slate-500">
                        {path.points.map((pt, pIdx) => (
                          <li key={pIdx} className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Transition Arrow on Desktop */}
                {path.arrow && (
                  <div className={`hidden lg:flex w-6 shrink-0 items-center justify-center ${path.arrowColor}`}>
                    <svg className="w-6 h-6 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                )}

              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 7. SECTION: OUTCOME & REVIEWS */}
      <section id="danh-gia" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-[#FFFDF7] border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[45%_55%] gap-8">
          
          {/* Left: CON NHẬN ĐƯỢC GÌ SAU KHI HỌC? */}
          <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-quicksand font-extrabold text-lg sm:text-xl text-slate-800 tracking-tight mb-6 uppercase">
                CON NHẬN ĐƯỢC GÌ SAU KHI HỌC?
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                {[
                  { title: 'Tự tin giao tiếp', icon: MessageSquare, color: 'bg-emerald-100 text-emerald-600 border-emerald-200' },
                  { title: 'Phát âm chuẩn hơn', icon: Volume2, color: 'bg-amber-100 text-amber-600 border-amber-200' },
                  { title: 'Yêu thích Tiếng Anh', icon: Heart, color: 'bg-rose-100 text-rose-600 border-rose-200' },
                  { title: 'Sẵn sàng thi Cambridge', icon: Award, color: 'bg-blue-100 text-blue-600 border-blue-200' }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center text-center p-3 rounded-2xl border border-slate-50 bg-slate-50/20">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 mb-3 shadow-inner ${item.color}`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className="font-quicksand font-extrabold text-xs text-slate-800 leading-tight">{item.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: PHỤ HUYNH NÓI GÌ VỀ 123ENGLISH? */}
          <div className="bg-[#10B981]/5 p-6 sm:p-8 rounded-[2rem] border border-[#10B981]/10 flex flex-col justify-between">
            <div>
              <h3 className="font-quicksand font-extrabold text-lg sm:text-xl text-slate-800 tracking-tight mb-6 uppercase">
                PHỤ HUYNH NÓI GÌ VỀ{' '}
                <span className="font-quicksand font-extrabold inline-flex ml-1">
                  <span className="text-[#FBBF24]">1</span>
                  <span className="text-[#F97316]">2</span>
                  <span className="text-[#2563EB]">3</span>
                  <span className="text-[#2563EB] ml-0.5">ENGLISH</span>
                </span>?
              </h3>

              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { name: 'Chị Hồng Nhung', sub: 'Mẹ bé Minh Châu', review: 'Bé rất thích học với giáo viên vui tính. Con tự tin nói tiếng Anh hơn hẳn.', stars: 5, img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces' },
                  { name: 'Anh Quốc Bảo', sub: 'Ba bé Gia Huy', review: 'Học 1 kèm 1 con được sửa lỗi, tiến bộ nhanh. Báo cáo định kỳ rõ ràng.', stars: 5, img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces' },
                  { name: 'Chị Thu Trang', sub: 'Mẹ bé Bảo Ngọc', review: 'Chương trình học sinh động. Con học mà như chơi, không hề chán.', stars: 5, img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=faces' }
                ].map((testi, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <img src={testi.img} alt={testi.name} className="w-8 h-8 rounded-full object-cover border border-slate-100" />
                        <div>
                          <h4 className="font-jakarta font-bold text-[10px] text-slate-800 leading-none">{testi.name}</h4>
                          <span className="text-[8px] text-slate-400 font-bold leading-none">{testi.sub}</span>
                        </div>
                      </div>
                      <div className="flex gap-0.5 text-[#F59E0B] mb-2">
                        {Array.from({ length: testi.stars }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-current" />
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">"{testi.review}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 8. SECTION: CÂU HỎI THƯỜNG GẶP */}
      <section id="cau-hoi" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[25%_75%] gap-8 items-center">
          
          {/* Left: Husky Mascot graphic */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-28 h-28 relative">
              <img src="/logo.png" alt="Husky Mascot" className="w-full h-full object-contain animate-bounce" />
            </div>
            <h3 className="font-quicksand font-extrabold text-base text-slate-800 uppercase tracking-tight text-center mt-3 leading-tight">
              CÂU HỎI<br />THƯỜNG GẶP
            </h3>
          </div>

          {/* Right: Accordions list in 2 columns */}
          <div className="grid md:grid-cols-2 gap-4 font-jakarta font-bold text-xs sm:text-sm">
            {/* Column 1 */}
            <div className="space-y-3">
              {[
                { q: 'Học online có hiệu quả không?', a: 'Chương trình học 1 kèm 1 tương tác trực tiếp giúp bé tập trung tối đa, giáo viên sửa lỗi phát âm ngay lập tức, mang lại hiệu quả vượt trội hơn so với các lớp học offline đông người.' },
                { q: 'Bé mất gốc có học được không?', a: 'Có, giáo trình được thiết kế cá nhân hóa bắt đầu từ những từ vựng, âm cơ bản nhất để bé làm quen và dần xây dựng sự tự tin.' },
                { q: 'Một buổi học kéo dài bao lâu?', a: 'Mỗi buổi học kéo dài 25 phút để đạt hiệu quả tối ưu nhất với khả năng tập trung của bé.' },
                { q: 'Học phí như thế nào?', a: 'Học phí linh hoạt theo gói học và lộ trình của bé. Vui lòng đăng ký tư vấn để nhận báo giá chi tiết và các chương trình ưu đãi mới nhất.' }
              ].map((faq, idx) => (
                <div key={idx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all duration-200">
                  <button
                    onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                    className="w-full px-4 py-3.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors text-slate-800 font-semibold"
                  >
                    <span className="text-xs sm:text-sm">{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${faqOpenIndex === idx ? 'rotate-180 text-[#10B981]' : ''}`} />
                  </button>
                  {faqOpenIndex === idx && (
                    <div className="px-4 pb-4 pt-1 text-slate-500 font-medium text-xs leading-relaxed border-t border-slate-50 bg-[#F3FDF9]/20">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Column 2 */}
            <div className="space-y-3">
              {[
                { q: 'Giáo viên có phù hợp cho trẻ em không?', a: 'Đội ngũ giáo viên Philippines tại 123English được tuyển chọn khắt khe, có chứng chỉ giảng dạy quốc tế và giàu kinh nghiệm, thấu hiểu tâm lý trẻ em.' },
                { q: 'Lớp học 1 kèm 1 có lợi ích gì?', a: 'Bé được tương tác 100% thời gian với giáo viên, được thiết kế lộ trình riêng và học theo tốc độ tiếp thu của chính mình.' },
                { q: 'Phụ huynh có thể theo dõi tiến độ của bé không?', a: 'Có, sau mỗi buổi học giáo viên đều có nhận xét chi tiết và hệ thống sẽ tự động cập nhật báo cáo tiến độ học tập định kỳ.' },
                { q: 'Có chương trình học thử không?', a: 'Có, 123English hỗ trợ 1 buổi học thử và đánh giá trình độ hoàn toàn miễn phí cho bé.' }
              ].map((faq, idx) => {
                const actualIdx = idx + 4
                return (
                  <div key={actualIdx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all duration-200">
                    <button
                      onClick={() => setFaqOpenIndex(faqOpenIndex === actualIdx ? null : actualIdx)}
                      className="w-full px-4 py-3.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors text-slate-800 font-semibold"
                    >
                      <span className="text-xs sm:text-sm">{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${faqOpenIndex === actualIdx ? 'rotate-180 text-[#10B981]' : ''}`} />
                    </button>
                    {faqOpenIndex === actualIdx && (
                      <div className="px-4 pb-4 pt-1 text-slate-500 font-medium text-xs leading-relaxed border-t border-slate-50 bg-[#F3FDF9]/20">
                        {faq.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      {/* 9. FOOTER CTA SECTION */}
      <section className="py-12 px-4 sm:px-6 md:px-12 lg:px-20 bg-[#FFF9E5] border-t border-slate-100/50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[55%_45%] gap-8 items-center relative z-10">
          
          {/* Left Side: Photo & Bullets */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-44 h-44 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-lg shrink-0 bg-[#FFFDF7]">
              <img src="/footer_kid.png" alt="Bé học tập vui vẻ" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-quicksand font-extrabold text-xl sm:text-2xl text-slate-800 leading-tight">
                ĐẦU TƯ CHO TƯƠNG LAI CỦA CON<br />
                <span className="text-[#10B981] font-black font-quicksand uppercase">BẮT ĐẦU TỪ HÔM NAY!</span>
              </h3>
              
              <div className="mt-4 space-y-2 font-jakarta font-bold text-xs text-slate-500">
                {['Kiểm tra trình độ miễn phí', 'Học thử 1 kèm 1 cùng giáo viên', 'Nhận lộ trình cá nhân hóa'].map((pt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-[#10B981] flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: Form */}
          <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100">
            <form onSubmit={(e) => handleSignupSubmit(e, 'Tiếng Anh Trẻ Em (Footer)')} className="space-y-3">
              <input 
                type="text" 
                required
                value={formBottomTreEm.parentName}
                onChange={(e) => setFormBottomTreEm({...formBottomTreEm, parentName: e.target.value})}
                placeholder="Họ và tên phụ huynh *"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] font-medium"
              />
              <input 
                type="tel" 
                required
                value={formBottomTreEm.phone}
                onChange={(e) => setFormBottomTreEm({...formBottomTreEm, phone: e.target.value})}
                placeholder="Số điện thoại liên hệ *"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] font-medium"
              />
              <select 
                value={formBottomTreEm.kidAge}
                onChange={(e) => setFormBottomTreEm({...formBottomTreEm, kidAge: e.target.value})}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-[#10B981] font-medium appearance-none"
              >
                <option value="5-6">Độ tuổi của bé: 5 - 6 tuổi</option>
                <option value="7-9">Độ tuổi của bé: 7 - 9 tuổi</option>
                <option value="10-12">Độ tuổi của bé: 10 - 12 tuổi</option>
              </select>

              <button 
                type="submit"
                className="w-full py-4 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-extrabold rounded-xl transition-all duration-300 text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-sm"
              >
                ĐĂNG KÝ HỌC THỬ MIỄN PHÍ &gt;
              </button>
            </form>
          </div>

        </div>
      </section>
        </>
      )}

      {landingType === 'teens' && (
        <>
          {/* ========================================================================= */}
          {/* MEGA-SECTION 2: TIẾNG ANH MẤT GỐC (AGES 13-18 OR GENERAL) - IMAGE 2        */}
          {/* ========================================================================= */}
          <section id="mat-goc" className="py-20 px-4 sm:px-6 md:px-12 lg:px-20 bg-gradient-to-b from-[#F0FDFA] via-white to-[#F5F8FF] border-t border-slate-100 scroll-mt-20 relative overflow-hidden">
        
        <div className="absolute top-40 right-10 w-44 h-44 bg-blue-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-40 left-10 w-64 h-64 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          
          {/* Section Header (Layout 2 top style) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 pb-6 border-b border-slate-200/50 font-quicksand font-bold text-slate-600">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#2563EB]/15 text-[#2563EB] font-extrabold text-xs rounded-full uppercase tracking-wider">
                Teenagers Program
              </span>
              <span className="text-slate-400 font-medium">|</span>
              <span className="text-slate-600 font-bold text-sm">Xây lại nền tảng vững chắc - Tự tin giao tiếp</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dạy thật - Học thật - Tick xanh thật</span>
            </div>
          </div>

          {/* Hero Grid */}
          <div className="grid lg:grid-cols-[55%_45%] gap-12 items-center">
            
            {/* Left side text */}
            <div>
              <span className="inline-block px-4 py-1.5 bg-[#2563EB] text-white font-quicksand font-extrabold text-xs rounded-full uppercase tracking-wider shadow-sm mb-6">
                Lấy Lại Gốc Tiếng Anh
              </span>

              <h1 className="font-quicksand font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-tight text-slate-800 tracking-tight">
                HỌC LẠI TỪ ĐẦU<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2563EB] to-emerald-500 font-quicksand font-black">
                  KHÔNG CÒN NGẠI NỮA!
                </span>
              </h1>
              
              <p className="mt-4 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-lg">
                Lộ trình cá nhân hóa - Học 1 kèm 1 cùng giáo viên Philippines chỉ với <span className="text-[#D97706] font-bold">25 phút mỗi buổi học</span> giúp học sinh và người mất gốc nhanh chóng lấy lại căn bản.
              </p>

              {/* 4 badges in a row (Mockup White boxes with clean outline) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-8 font-quicksand font-bold text-[11px] text-slate-700">
                {[
                  { title: '1 KÈM 1 CÁ NHÂN HÓA', icon: UserCheck, color: 'text-emerald-500 bg-emerald-50/50' },
                  { title: 'GIÁO VIÊN PHILIPPINES', icon: Sparkles, color: 'text-amber-500 bg-amber-50/50' },
                  { title: 'HỌC ONLINE LINH HOẠT', icon: Globe, color: 'text-blue-500 bg-blue-50/50' },
                  { title: 'TIẾN BỘ SAU TỪNG BUỔI', icon: Award, color: 'text-indigo-500 bg-indigo-50/50' }
                ].map((bg, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl border border-slate-100 bg-white flex flex-col items-center justify-center text-center gap-2 hover:shadow-md transition-shadow duration-200">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bg.color}`}>
                      <bg.icon className="w-4.5 h-4.5" />
                    </div>
                    <span>{bg.title}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
                <a 
                  href="#mat-goc-quay"
                  className="w-full sm:w-auto px-8 py-4 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-bold rounded-full text-center shadow-lg shadow-emerald-200/50 transition-all duration-300 font-quicksand uppercase tracking-wider text-xs"
                >
                  Đăng ký học thử miễn phí &gt;
                </a>
                <span className="text-xs text-slate-500 font-medium text-center">
                  Trải nghiệm ngay 1 buổi học thử với giáo viên Philippines
                </span>
              </div>
            </div>

            {/* Right side image overlap with tick xanh badge */}
            <div className="relative flex justify-center">
              <div className="rounded-[2.5rem] overflow-hidden border-[6px] border-white shadow-2xl shadow-blue-900/10 bg-blue-50 max-w-[440px]">
                <img 
                  src="/hero2.png" 
                  alt="Học sinh mất gốc ôn luyện tiếng Anh" 
                  className="w-full h-auto object-cover object-center max-h-[350px]"
                />
              </div>

              {/* Tick Xanh Certificate Badge */}
              <div className="absolute -bottom-6 right-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-slate-700/50 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2563EB] rounded-full flex items-center justify-center text-white shadow-lg">
                  <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase font-quicksand">ĐẶC QUYỀN HỌC VIÊN</div>
                  <div className="text-xs font-black tracking-wide text-emerald-400 font-quicksand">ĐẤU TICK XANH 123ENGLISH</div>
                </div>
              </div>
            </div>

          </div>

          {/* Section: BẠN CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-1.5 uppercase">
              <span className="text-[#2563EB]">✦</span> BẠN CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? <span className="text-[#2563EB]">✦</span>
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-10">
              {[
                { title: 'Mất gốc tiếng Anh lâu năm', svg: TeenLostRootSVG },
                { title: 'Ngữ pháp rối, không nhớ gì', svg: TeenGrammarSVG },
                { title: 'Nghe không hiểu, nói không ra', svg: TeenListeningSVG },
                { title: 'Ngại giao tiếp với người nước ngoài', svg: TeenShySVG },
                { title: 'Học nhiều lần nhưng không hiệu quả', svg: TeenRepeatedSVG },
                { title: 'Thiếu môi trường luyện tập thực tế', svg: TeenNoEnvironmentSVG }
              ].map((prob, idx) => (
                <div key={idx} className="bg-gradient-to-b from-white to-[#F5F8FF]/50 p-6 rounded-[2rem] border border-blue-100/60 hover:border-blue-300/60 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.06)] hover:shadow-[0_20px_35px_-8px_rgba(37,99,235,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                  <div className="mb-5 transform transition-all duration-500 group-hover:scale-110 group-hover:-rotate-2">
                    <prob.svg />
                  </div>
                  <h4 className="font-quicksand font-extrabold text-xs sm:text-[13px] text-slate-700 leading-relaxed max-w-[150px]">{prob.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Blue Ribbon Divider */}
          <div className="mt-16 bg-gradient-to-r from-[#2563EB] to-blue-700 text-white py-4.5 px-6 rounded-2xl shadow-md text-center font-quicksand font-bold text-xs sm:text-sm tracking-wide border border-blue-500">
            123ENGLISH giúp bạn xây lại nền tảng vững chắc và tự tin giao tiếp chỉ với 25 phút mỗi buổi học.
          </div>

          {/* Section: VÌ SAO HỌC VIÊN CHỌN 123ENGLISH? */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              VÌ SAO HỌC VIÊN CHỌN <span className="text-[#2563EB]">123ENGLISH</span>?
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-10">
              {[
                { title: 'Giáo viên Philippines', desc: 'giàu kinh nghiệm, dễ hiểu, tận tâm', svg: TeacherFlagSVG },
                { title: 'Học 1 kèm 1', desc: 'cá nhân hóa 100% từng buổi học', svg: KidsStudyingSVG },
                { title: 'Lộ trình từ cơ bản', desc: 'đến nâng cao, được thiết kế riêng', svg: OpenBookSVG },
                { title: 'Tập trung giao tiếp', desc: 'thực tế, phản xạ tự nhiên nhanh', svg: TalkBubbleSVG },
                { title: 'Học linh hoạt', desc: 'mọi lúc, mọi nơi theo lịch rảnh', svg: FlexibleGlobeSVG },
                { title: 'Theo dõi tiến độ', desc: 'báo cáo định kỳ rõ ràng, chuẩn', svg: ProgressChartSVG }
              ].map((reason, idx) => (
                <div key={idx} className="bg-gradient-to-b from-white to-slate-50/50 p-6 rounded-[2rem] border border-blue-100/40 hover:border-blue-300/60 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.05)] hover:shadow-[0_20px_35px_-8px_rgba(37,99,235,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                  <div className="mb-5 transform transition-all duration-500 group-hover:scale-110">
                    <reason.svg />
                  </div>
                  <h4 className="font-quicksand font-extrabold text-xs text-slate-800 leading-tight">{reason.title}</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-2 leading-relaxed max-w-[140px]">{reason.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section: ĐẶC QUYỀN HỌC VIÊN TICK XANH (WHEEL OF FORTUNE) */}
          <div id="mat-goc-quay" className="mt-24 bg-white p-6 sm:p-10 rounded-3xl border border-slate-100 shadow-sm scroll-mt-20">
            <span className="inline-block px-3.5 py-1 bg-[#2563EB]/15 text-[#2563EB] font-extrabold text-[10px] rounded-full uppercase tracking-wider mb-2 font-quicksand">
              Đặc Quyền Học Viên Tick Xanh
            </span>
            <h3 className="font-quicksand font-extrabold text-xl sm:text-2xl text-slate-800 tracking-tight mb-8">
              Sau khi học thử và đăng ký khóa học, học viên được nhận lượt quay may mắn 100% trúng quà:
            </h3>

            {/* 4 Steps Timeline Ribbon */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-4 px-6 bg-slate-50 rounded-2xl border border-slate-100 mb-8 font-quicksand font-bold text-[10px] sm:text-xs text-slate-600">
              <span className="text-[#2563EB] font-black uppercase text-xs">Quy trình nhận quà:</span>
              <span className="flex items-center gap-1.5"><HelpCircle className="w-4 h-4 text-[#2563EB]" /> 1. Pose đấu Tick Xanh</span>
              <span className="text-slate-300 font-normal">→</span>
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-[#2563EB]" /> 2. Đăng ký khóa học</span>
              <span className="text-slate-300 font-normal">→</span>
              <span className="flex items-center gap-1.5"><RotateCw className="w-4 h-4 text-[#2563EB] animate-spin" /> 3. Nhận 1 lượt quay</span>
              <span className="text-slate-300 font-normal">→</span>
              <span className="flex items-center gap-1.5"><Gift className="w-4 h-4 text-[#2563EB]" /> 4. 100% có quà</span>
            </div>

            {/* Spinner Widget Layout */}
            <div className="grid lg:grid-cols-[30%_40%_30%] gap-8 items-center justify-center">
              
              {/* Left Column: Checklist */}
              <div className="bg-[#EFF6FF]/30 p-5 rounded-2xl border border-[#EFF6FF]/60 font-jakarta">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                  <span className="font-bold text-[#2563EB] text-sm uppercase tracking-wide font-quicksand">CAM KẾT CHẤT LƯỢNG</span>
                </div>
                
                <ul className="space-y-3 font-semibold text-xs text-slate-600">
                  {[
                    { label: 'Giáo viên thật', desc: 'Có bằng cấp & chứng chỉ quốc tế' },
                    { label: 'Học viên thật', desc: 'Cam kết đầu ra bằng văn bản' },
                    { label: 'Lớp học thật', desc: '1 kèm 1 tương tác trực tiếp 100%' },
                    { label: 'Kết quả thật', desc: 'Theo dõi tiến độ buổi học rõ ràng' }
                  ].map((chk, idx) => (
                    <li key={idx} className="flex gap-2">
                      <Check className="w-4 h-4 text-[#10B981] stroke-[3.5] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-700 block">{chk.label}</span>
                        <span className="text-[10px] text-slate-400 font-bold">{chk.desc}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Middle Column: Visual SVG Wheel of Fortune */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-[300px] h-[300px] flex items-center justify-center select-none">
                  
                  {/* Outer glowing border */}
                  <div className={`absolute inset-0 rounded-full border-8 border-slate-800 bg-slate-900 shadow-2xl transition-all duration-300 ${spinning ? 'ring-4 ring-yellow-400' : ''}`} />
                  <div className="absolute inset-2 rounded-full border border-white/10 pointer-events-none" />

                  {/* SVG Wheel */}
                  <svg width="300" height="300" viewBox="0 0 300 300" className="relative z-10">
                    <g 
                      style={{
                        transform: `rotate(${wheelRotation}deg)`,
                        transition: 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        transformOrigin: '150px 150px'
                      }}
                    >
                      {sectors.map((sector, i) => {
                        const startAngle = i * 60;
                        const endAngle = (i + 1) * 60;
                        const radStart = (startAngle * Math.PI) / 180;
                        const radEnd = (endAngle * Math.PI) / 180;
                        const r = 136;
                        const x1 = 150 + r * Math.cos(radStart);
                        const y1 = 150 + r * Math.sin(radStart);
                        const x2 = 150 + r * Math.cos(radEnd);
                        const y2 = 150 + r * Math.sin(radEnd);
                        
                        const pathData = `M 150 150 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
                        
                        const textAngle = startAngle + 30;
                        const radText = (textAngle * Math.PI) / 180;
                        const textDist = 80;
                        const tx = 150 + textDist * Math.cos(radText);
                        const ty = 150 + textDist * Math.sin(radText);

                        return (
                          <g key={i}>
                            <path
                              d={pathData}
                              fill={sector.color}
                              stroke={sector.border}
                              strokeWidth="1.5"
                            />
                            <text
                              x={tx}
                              y={ty}
                              transform={`rotate(${textAngle + 90}, ${tx}, ${ty})`}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill={sector.textColor}
                              className="text-[9.5px] font-bold tracking-tight"
                            >
                              {sector.labelLines.map((line, wIdx) => (
                                <tspan key={wIdx} x={tx} dy={wIdx === 0 ? -4 : 10}>
                                  {line}
                                </tspan>
                              ))}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                    
                    {/* Top Pointer */}
                    <g className="relative z-20">
                      <polygon points="150,25 140,5 160,5" fill="#EF4444" />
                      <circle cx="150" cy="5" r="3" fill="#FFFFFF" />
                    </g>

                    {/* Center Click Cap */}
                    <g 
                      onClick={handleSpin}
                      className="cursor-pointer relative z-30 group"
                    >
                      <circle cx="150" cy="150" r="24" fill="#FFD700" stroke="#F59E0B" strokeWidth="3" className="filter drop-shadow-md transition-transform duration-200 group-hover:scale-105" />
                      <circle cx="150" cy="150" r="18" fill="#FFFFFF" />
                      <text
                        x="150"
                        y="150"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#D97706"
                        className="text-[10px] font-black tracking-tighter select-none font-quicksand"
                      >
                        SPIN
                      </text>
                    </g>
                  </svg>

                </div>

                {/* Spin Button */}
                <button
                  onClick={handleSpin}
                  disabled={spinning || hasSpun}
                  className="mt-6 px-8 py-3 bg-[#2563EB] hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-quicksand font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md"
                >
                  {spinning ? 'Đang quay...' : hasSpun ? 'Đã quay xong' : 'QUAY NGAY HỌC BỔNG'}
                </button>
              </div>

              {/* Right Column: Vouchers List */}
              <div className="space-y-2.5 font-jakarta font-bold text-xs">
                <div className="text-slate-700 border-b pb-2 flex items-center gap-1.5 font-quicksand font-extrabold">
                  <Gift className="w-4 h-4 text-rose-500" />
                  <span>DANH SÁCH PHẦN QUÀ</span>
                </div>
                {[
                  { text: 'Voucher học phí 500.000đ', prize: 'Voucher 500.000đ' },
                  { text: 'Voucher học phí 300.000đ', prize: 'Voucher 300.000đ' },
                  { text: 'Voucher học phí 200.000đ', prize: 'Voucher 200.000đ' },
                  { text: 'Tặng 01 buổi học 1-1 miễn phí', prize: '01 Buổi Học Miễn Phí' },
                  { text: 'Tặng 02 buổi học 1-1 miễn phí', prize: '02 Buổi Học Miễn Phí' },
                  { text: 'Quà lưu niệm đặc biệt từ trung tâm', prize: 'Quà Tặng Đặc Biệt' }
                ].map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors duration-300 ${prizeIndex === idx && hasSpun ? 'border-[#10B981] bg-[#ECFDF5]/60 text-[#059669]' : 'border-slate-100 bg-slate-50 text-slate-600'}`}
                  >
                    <span>{item.text}</span>
                    {prizeIndex === idx && hasSpun && <span className="text-[10px] bg-[#10B981] text-white px-2 py-0.5 rounded-full font-black uppercase">Trúng</span>}
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* Pricing Banner Row */}
          <div className="mt-16 bg-[#FFFBEB] p-6 rounded-3xl border border-[#FDE68A] flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm text-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider font-quicksand">Học phí niêm yết</span>
                <div className="font-quicksand font-extrabold text-2xl text-[#E11D48]">4.500.000đ <span className="text-xs text-slate-400 font-semibold line-through">6.000.000đ</span></div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-100">
              <Sparkles className="w-4 h-4 text-yellow-500 animate-spin" />
              <span className="font-jakarta font-bold text-xs text-slate-600">Tặng ngay 1 lượt quay voucher học bổng 100% trúng quà</span>
            </div>

            <a 
              href="#mat-goc-quay"
              className="w-full sm:w-auto px-6 py-3.5 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-bold rounded-xl text-center shadow-md text-xs uppercase tracking-wider"
            >
              ĐĂNG KÝ HỌC THỬ MIỄN PHÍ NGAY
            </a>
          </div>

          {/* Testimonials */}
          <div className="mt-24">
            <h3 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              HỌC VIÊN NÓI GÌ VỀ <span className="text-[#2563EB]">123ENGLISH</span>?
            </h3>
            
            <div className="grid lg:grid-cols-3 gap-6 mt-10">
              {[
                { name: 'Minh Tuấn', role: 'Nhân viên văn phòng', text: 'Mình đã mất gốc tiếng Anh nhiều năm, không tự tin nói từ nào. Nhưng chỉ sau 2 tháng học 1 kèm 1 ở 123English, mình đã hiểu lại cấu trúc ngữ pháp cơ bản và tự tin trả lời giao tiếp thông thường với người nước ngoài.', stars: 5, img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces' },
                { name: 'Thu Trang', role: 'Kinh doanh tự do', text: 'Giáo viên rất kiên nhẫn, nhiệt tình hướng dẫn và sửa lỗi chi tiết. Lộ trình học 25 phút mỗi ngày vô cùng phù hợp với thời gian bận rộn của mình.', stars: 5, img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces' },
                { name: 'Hoàng Nam', role: 'Kỹ sư cơ khí', text: 'Lớp học 1-1 trực tuyến giúp mình tăng phản xạ nói tối đa. Giáo viên thân thiện, vui tính giúp mình không còn ngại hay lo sợ khi mở lời phát âm tiếng Anh.', stars: 5, img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=faces' }
              ].map((testi, idx) => (
                <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                      <div className="flex items-center gap-3">
                        <img src={testi.img} alt={testi.name} className="w-10 h-10 rounded-full object-cover border-2 border-[#2563EB]/10" />
                        <div>
                          <h4 className="font-jakarta font-bold text-sm text-slate-800 leading-none">{testi.name}</h4>
                          <span className="text-[10px] text-slate-400 font-bold mt-1.5 block leading-none">{testi.role}</span>
                        </div>
                      </div>
                      <div className="flex gap-0.5 text-amber-400 font-bold">
                        {Array.from({ length: testi.stars }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed italic">"{testi.text}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer CTA Banner (Blue colors matching Mockup 2) */}
          <div className="mt-24 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden shadow-xl text-white grid lg:grid-cols-[60%_40%] gap-8 items-center border border-blue-500/30">
            
            <div className="relative z-10">
              <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 font-quicksand">ĐỪNG CHỜ ĐỢI NỮA!</span>
              <h3 className="font-quicksand font-extrabold text-2xl sm:text-3xl lg:text-4xl leading-tight mt-4">
                Đăng ký học thử miễn phí ngay hôm nay!
              </h3>
              <p className="mt-3 text-xs sm:text-sm font-semibold opacity-70 leading-relaxed max-w-md">
                Lấy lại gốc nhanh chóng, tự tin làm chủ ngôn ngữ và thăng tiến trong cuộc sống cùng 123English.
              </p>

<div className="mt-6 flex flex-col gap-3 font-jakarta font-bold text-xs sm:text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Hotline hỗ trợ 24/7: 1900 633 876</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Website chính thức: 123english.vn</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Facebook hỗ trợ: facebook.com/123english.vn</span>
                </div>
              </div>
            </div>

            {/* Golden Scholarship Ticket Graphics */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <svg viewBox="0 0 120 90" className="w-44 h-32 select-none animate-pulse-soft">
                <defs>
                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFF2C2" />
                    <stop offset="30%" stopColor="#F59E0B" />
                    <stop offset="70%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#92400E" />
                  </linearGradient>
                  <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                    <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                  {/* Smooth SVG blur filter to prevent box clipping artifacts */}
                  <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComponentTransfer in="blur" result="glow">
                      <feFuncA type="linear" slope="0.45" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                
                {/* 1. Glowing base shadow */}
                <path d="M 15,15 H 105 V 37 A 8,8 0 0,0 105,53 V 75 H 15 V 53 A 8,8 0 0,0 15,37 Z" fill="#F59E0B" filter="url(#goldGlow)" />
                
                {/* 2. Main Ticket Base */}
                <path d="M 15,15 H 105 V 37 A 8,8 0 0,0 105,53 V 75 H 15 V 53 A 8,8 0 0,0 15,37 Z" fill="url(#goldGrad)" stroke="#FFFFFF" strokeWidth="2" />
                
                {/* 3. Inner Decorative Dashed Border */}
                <path d="M 19,19 H 101 V 38 A 4,4 0 0,0 101,52 V 71 H 19 V 52 A 4,4 0 0,0 19,38 Z" fill="none" stroke="#FEF3C7" strokeWidth="1" strokeDasharray="3 2" opacity="0.75" />
                
                {/* Dashed divider line */}
                <line x1="37" y1="20" x2="37" y2="70" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.8" />
                
                {/* Ticket details */}
                <text x="26" y="47" fill="#FFFFFF" fontSize="5.5" fontWeight="900" textAnchor="middle" transform="rotate(-90 26 47)" letterSpacing="1.5" fontFamily="sans-serif" opacity="0.95">TICKET</text>
                
                <text x="73" y="38" fill="#FFFFFF" fontSize="9" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="0.5">HỌC BỔNG</text>
                <text x="73" y="54" fill="#FFFFFF" fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">100%</text>
                <text x="73" y="66" fill="#FEF3C7" fontSize="4.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif" opacity="0.9">123ENGLISH SPECIAL VOUCHER</text>
                
                {/* Shiny overlay */}
                <path d="M 15,15 H 105 V 37 A 8,8 0 0,0 105,53 V 75 H 15 V 53 A 8,8 0 0,0 15,37 Z" fill="url(#shineGrad)" pointerEvents="none" />
                
                {/* Star sparkles */}
                <path d="M 85,22 L 87,24 L 90,24 L 88,26 L 89,29 L 85,27 L 81,29 L 82,26 L 80,24 L 83,24 Z" fill="#FFFFFF" opacity="0.9" />
                <path d="M 45,58 L 46,59 L 48,59 L 47,60 L 47,62 L 45,61 L 43,62 L 44,60 L 43,59 L 45,59 Z" fill="#FEF3C7" opacity="0.8" />
              </svg>
              <a 
                href="#mat-goc-quay"
                className="w-full mt-4 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-quicksand font-bold rounded-xl text-center shadow-lg hover:shadow-xl transition-all duration-300 text-xs tracking-wider uppercase"
              >
                QUAY SỐ NHẬN HỌC BỔNG NGAY
              </a>
            </div>
          </div>

        </div>
      </section>
        </>
      )}

      {landingType === 'adults' && (
        <>
          {/* ========================================================================= */}
          {/* MEGA-SECTION 3: TIẾNG ANH NGƯỜI ĐI LÀM (ADULTS) - IMAGE 3                 */}
          {/* ========================================================================= */}
          <section id="nguoi-di-lam" className="py-20 px-4 sm:px-6 md:px-12 lg:px-20 bg-gradient-to-b from-[#F5F8FF] via-white to-slate-50 border-t border-slate-100 scroll-mt-20 relative overflow-hidden">
        
        <div className="absolute top-40 left-10 w-44 h-44 bg-yellow-200/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-40 right-10 w-64 h-64 bg-slate-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          
          {/* Section Header (Layout 3 header content) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 pb-6 border-b border-slate-200/50 font-quicksand font-bold text-slate-600">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#D97706]/15 text-[#D97706] font-extrabold text-xs rounded-full uppercase tracking-wider">
                Corporate Program
              </span>
              <span className="text-slate-400 font-medium">|</span>
              <span className="text-slate-600 font-bold text-sm">Tiếng Anh giao tiếp công việc chuyên nghiệp</span>
            </div>
            <div className="flex items-center gap-3">
              <a href="tel:0388.827.295" className="flex items-center gap-1.5 text-sm font-bold text-slate-800 hover:text-[#D97706] transition-colors">
                <Phone className="w-4 h-4 text-[#D97706]" />
                0388.827.295
              </a>
            </div>
          </div>

          {/* Hero Grid */}
          <div className="grid lg:grid-cols-[55%_45%] gap-12 items-center">
            
            {/* Left Column Text */}
            <div>
              <span className="inline-block px-4 py-1.5 bg-gradient-to-r from-[#D97706] to-orange-500 text-white font-quicksand font-bold text-xs rounded-full uppercase tracking-wider shadow-sm mb-6">
                Tiếng Anh Giao Tiếp Người Đi Làm
              </span>

              <h1 className="font-quicksand font-extrabold text-3xl sm:text-4xl lg:text-[42px] leading-tight text-slate-800 tracking-tight">
                TỰ TIN GIAO TIẾP TIẾNG ANH<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D97706] to-orange-500 inline-block px-2 rounded-lg mt-1.5 font-quicksand font-black">
                  TRONG CÔNG VIỆC
                </span>
              </h1>

              <ul className="mt-8 space-y-4 font-jakarta text-slate-600 font-semibold text-sm">
                {[
                  'Học 1 kèm 1 cùng giáo viên quốc tế sở hữu chuyên môn cao.',
                  'Lộ trình cá nhân hóa thiết kế riêng theo đặc thù từng ngành nghề.',
                  'Học online linh hoạt từ 8:00 - 23:00 hàng ngày cho người bận rộn.',
                  'Tập trung phát triển kỹ năng phản xạ họp, thuyết trình & đối tác ngoại.'
                ].map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-[#D97706] text-white rounded-full flex items-center justify-center mt-0.5 shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {/* Two CTA Buttons */}
              <div className="flex flex-wrap gap-3 mt-8 z-10 relative">
                <a 
                  href="#dang-ky-form"
                  className="px-6 py-3.5 bg-[#D97706] hover:bg-[#b45309] text-white font-quicksand font-bold rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-md flex items-center gap-2"
                >
                  Đăng ký học thử miễn phí
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a 
                  href="tel:0388827295"
                  className="px-6 py-3.5 border border-slate-300 hover:border-slate-800 text-slate-700 hover:text-slate-900 font-quicksand font-bold rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5"
                >
                  <Phone className="w-4 h-4" />
                  Liên hệ: 0388.827.295
                </a>
              </div>

              {/* Businessman image placed directly below */}
              <div className="mt-10 relative inline-block w-full max-w-[480px]">
                <div className="rounded-[2rem] overflow-hidden border-[6px] border-white shadow-xl bg-slate-100">
                  <img 
                    src="/hero3.png" 
                    alt="Người đi làm học tiếng Anh online" 
                    className="w-full h-auto object-cover object-center max-h-[300px]"
                  />
                </div>
              </div>
            </div>

            {/* Right Column Signup Form (White Card) */}
            <div className="bg-white text-slate-800 p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-2xl relative">
              <div className="absolute top-4 right-4 flex gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
              </div>
              
              <h3 className="font-quicksand font-extrabold text-lg sm:text-xl text-center text-slate-800 uppercase tracking-tight">
                Nhận buổi học thử <span className="text-[#D97706]">miễn phí</span>
              </h3>
              <p className="text-center text-[10px] text-slate-400 font-bold mt-1 mb-6">
                Khảo sát trình độ & thiết kế lộ trình theo ngành nghề
              </p>

              <form onSubmit={(e) => handleSignupSubmit(e, 'Tiếng Anh Người Đi Làm')} className="space-y-4">
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    required
                    value={formNguoiDiLam.name}
                    onChange={(e) => setFormNguoiDiLam({...formNguoiDiLam, name: e.target.value})}
                    placeholder="Họ và tên của bạn *"
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#D97706] text-slate-800 font-medium"
                  />
                </div>
                
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input 
                    type="tel" 
                    required
                    value={formNguoiDiLam.phone}
                    onChange={(e) => setFormNguoiDiLam({...formNguoiDiLam, phone: e.target.value})}
                    placeholder="Số điện thoại của bạn *"
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#D97706] text-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">Mục tiêu học của bạn</label>
                  <div className="grid grid-cols-2 gap-2 font-jakarta font-bold text-[10px] text-slate-700">
                    {[
                      'Giao tiếp công việc',
                      'Họp & Thuyết trình',
                      'Phỏng vấn',
                      'Khách hàng quốc tế'
                    ].map((opt) => {
                      const isChecked = formNguoiDiLam.objectives.includes(opt)
                      return (
                        <label 
                          key={opt}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${isChecked ? 'border-amber-500 bg-amber-500/10 text-[#D97706]' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100/50'}`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            className="hidden"
                            onChange={() => {
                              const newOpts = isChecked 
                                ? formNguoiDiLam.objectives.filter(o => o !== opt)
                                : [...formNguoiDiLam.objectives, opt]
                              setFormNguoiDiLam({...formNguoiDiLam, objectives: newOpts})
                            }}
                          />
                          <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${isChecked ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white'}`}>
                            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3.5]" />}
                          </span>
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4.5 bg-[#D97706] hover:bg-[#b45309] text-white font-quicksand font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-md shadow-amber-500/10"
                >
                  ĐĂNG KÝ HỌC THỬ MIỄN PHÍ
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-4 flex items-center justify-center gap-2 text-[9px] text-slate-400 font-bold bg-slate-50 py-2.5 rounded-lg border border-slate-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                THÔNG TIN ĐƯỢC BẢO MẬT TUYỆT ĐỐI
              </div>
            </div>

          </div>

          {/* Key Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 bg-white/70 p-6 rounded-2xl border border-slate-100 shadow-sm">
            {[
              { val: '100+', title: 'Giáo viên quốc tế', desc: 'Philippines & Bản xứ Mỹ, Anh' },
              { val: '10.000+', title: 'Giờ học hoàn thành', desc: 'Khắp cả nước ghi nhận' },
              { val: '1 KÈM 1', title: 'Cá nhân hóa', desc: 'Theo sát tiến độ từng học viên' },
              { val: 'Học online', title: 'Toàn quốc', desc: 'Chỉ cần laptop/điện thoại' }
            ].map((stat, idx) => (
              <div key={idx} className="text-center p-3 border-r last:border-0 border-slate-100/80">
                <div className="font-quicksand font-extrabold text-2xl lg:text-3xl text-slate-800">{stat.val}</div>
                <div className="font-bold text-[12px] text-slate-700 mt-1">{stat.title}</div>
                <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{stat.desc}</div>
              </div>
            ))}
          </div>

          {/* Section: BẠN CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-2">
              <span className="text-[#D97706]">✦</span> BẠN CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? <span className="text-[#D97706]">✦</span>
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-10">
              {[
                { title: 'Nghe hiểu nhưng không phản xạ được', svg: AdultNoReflexSVG },
                { title: 'Ngại nói tiếng Anh trong cuộc họp', svg: AdultMeetingShySVG },
                { title: 'Không biết cách diễn đạt ý tưởng', svg: AdultNoIdeaSVG },
                { title: 'Mất cơ hội thăng tiến nghề nghiệp', svg: AdultNoPromotionSVG },
                { title: 'Thiếu môi trường luyện nói thực tế', svg: AdultNoEnvSVG }
              ].map((prob, idx) => (
                <div key={idx} className="bg-gradient-to-b from-white to-[#FFFBEB]/30 p-6 rounded-[2rem] border border-amber-100/60 hover:border-amber-300/60 shadow-[0_4px_20px_-4px_rgba(217,119,6,0.06)] hover:shadow-[0_20px_35px_-8px_rgba(217,119,6,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                  <div className="mb-5 transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-2">
                    <prob.svg />
                  </div>
                  <h4 className="font-quicksand font-extrabold text-xs sm:text-[13px] text-slate-700 leading-relaxed max-w-[150px]">{prob.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Section: CHƯƠNG TRÌNH ĐƯỢC THIẾT KẾ RIÊNG CHO NGƯỜI ĐI LÀM */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              CHƯƠNG TRÌNH ĐƯỢC THIẾT KẾ RIÊNG CHO NGƯỜI ĐI LÀM
            </h2>

            <div className="grid lg:grid-cols-3 gap-6 mt-10">
              {[
                { 
                  title: 'TIẾNG ANH GIAO TIẾP CÔNG SỞ', 
                  imgSrc: '/adult_office.png',
                  tag: 'Office English',
                  tagClass: 'bg-blue-500 text-white',
                  alignClass: 'object-top',
                  pts: ['Giao tiếp hằng ngày tại văn phòng', 'Trao đổi công việc qua điện thoại', 'Báo cáo & cập nhật tiến độ dự án', 'Giao tiếp với đồng nghiệp nước ngoài', 'Viết email chuyên nghiệp']
                },
                { 
                  title: 'TIẾNG ANH HỌP & THUYẾT TRÌNH', 
                  imgSrc: '/adult_meeting.png',
                  tag: 'Meetings',
                  tagClass: 'bg-amber-500 text-white',
                  alignClass: 'object-top',
                  pts: ['Tham gia cuộc họp tiếng Anh chủ động', 'Trình bày ý tưởng mạch lạc, rõ ý', 'Phản biện & đóng góp ý kiến dự án', 'Báo cáo & thuyết trình trước đối tác', 'Xử lý các câu hỏi phát sinh']
                },
                { 
                  title: 'LÀM VIỆC VỚI KHÁCH QUỐC TẾ', 
                  imgSrc: '/adult_client.png',
                  tag: 'Global Clients',
                  tagClass: 'bg-emerald-500 text-white',
                  alignClass: 'object-center',
                  pts: ['Tư vấn & giới thiệu sản phẩm', 'Trao đổi yêu cầu chi tiết dự án', 'Xử lý các tình huống khó khăn', 'Đàm phán cơ bản về điều khoản', 'Follow-up email chuyên nghiệp']
                }
              ].map((prog, idx) => (
                <div key={idx} className="bg-white rounded-3xl border border-slate-100 hover:border-amber-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden group">
                  <div className="aspect-square overflow-hidden relative">
                    <img src={prog.imgSrc} alt={prog.title} className={`w-full h-full object-cover ${prog.alignClass} transition-transform duration-500 group-hover:scale-105`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className={`inline-block px-3 py-1 rounded-full font-quicksand font-bold text-[10px] uppercase tracking-wider ${prog.tagClass}`}>
                        {prog.tag}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-quicksand font-extrabold text-base text-slate-800 tracking-tight mb-4">{prog.title}</h4>
                      <ul className="space-y-3 font-jakarta font-semibold text-xs sm:text-sm text-slate-500">
                        {prog.pts.map((pt, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between text-[#D97706] font-quicksand font-bold text-xs uppercase tracking-wider group-hover:text-[#b45309]">
                      <span>Tìm hiểu chương trình</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: VÌ SAO HỌC VIÊN CHỌN 123ENGLISH? */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              VÌ SAO HỌC VIÊN CHỌN <span className="text-[#D97706]">123ENGLISH</span>?
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-10">
              {[
                { title: '1 KÈM 1 CÁ NHÂN HÓA', desc: 'Học theo mục tiêu riêng của bạn', icon: UserCheck },
                { title: 'LỘ TRÌNH NGÀNH NGHỀ', desc: 'Nội dung bám sát công việc thực tế', icon: BookOpen },
                { title: 'GIÁO VIÊN QUỐC TẾ', desc: 'Philippines & bản xứ native Mỹ, Anh', icon: Sparkles },
                { title: 'LINH HOẠT THỜI GIAN', desc: 'Học sáng, trưa, tối theo lịch rảnh', icon: Globe },
                { title: 'TẬP TRUNG PHẢN XẠ', desc: 'Nói nhiều hơn, thực hành thực tế', icon: MessageSquare },
                { title: 'THEO DÕI TIẾN ĐỘ', desc: 'Nhận feedback thường xuyên, báo cáo', icon: FileText }
              ].map((reason, idx) => (
                <div key={idx} className="bg-gradient-to-b from-white to-slate-50/50 p-6 rounded-[2rem] border border-amber-100/40 hover:border-amber-300/60 shadow-[0_4px_20px_-4px_rgba(217,119,6,0.05)] hover:shadow-[0_20px_35px_-8px_rgba(217,119,6,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-center text-center group">
                  <div className="w-14 h-14 rounded-full bg-[#D97706]/10 text-[#D97706] flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-110 group-hover:bg-[#D97706]/20">
                    <reason.icon className="w-6 h-6 stroke-[2]" />
                  </div>
                  <h4 className="font-quicksand font-extrabold text-xs text-slate-800 leading-tight uppercase">{reason.title}</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-2 leading-relaxed max-w-[140px]">{reason.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Motivation Banner Section */}
          <div className="mt-24 bg-gradient-to-br from-[#D97706] to-orange-500 rounded-[2rem] p-8 lg:p-10 relative overflow-hidden shadow-xl text-white border border-orange-400/20">
            <div className="relative z-10 grid lg:grid-cols-[60%_40%] gap-8 items-center">
              <div>
                <span className="inline-block px-3 py-1 bg-white/20 text-white font-quicksand font-bold text-[10px] rounded-full uppercase tracking-wider mb-4 border border-white/20">
                  Career Breakthrough
                </span>
                <h3 className="font-quicksand font-extrabold text-2xl sm:text-3xl leading-tight">
                  TIẾNG ANH TỐT HƠN – CƠ HỘI LỚN HƠN
                </h3>
                <p className="mt-3 text-xs opacity-90 leading-relaxed max-w-xl font-medium font-jakarta">
                  Sử dụng tiếng Anh chuyên nghiệp giúp bạn tự tin mở khóa các cơ hội thăng tiến, tăng thu nhập và làm việc tự tin trong các doanh nghiệp quốc tế.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-3 font-jakarta font-bold text-[11px] text-white">
                  {[
                    'Tăng khả năng thăng chức',
                    'Làm việc tập đoàn đa quốc gia',
                    'Mở rộng cơ hội nghề nghiệp',
                    'Gia tăng thu nhập 30-50%'
                  ].map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white/10 p-2.5 rounded-xl border border-white/5">
                      <CheckCircle2 className="w-4 h-4 text-amber-300 flex-shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
                
                <div className="mt-8 font-quicksand">
                  <a 
                    href="#dang-ky-form"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-900 font-quicksand font-bold rounded-xl text-xs tracking-wider uppercase transition-all duration-300 shadow-md animate-pulse"
                  >
                    NHẬN LỘ TRÌNH CÁ NHÂN HÓA
                    <ArrowRight className="w-4 h-4 text-[#D97706]" />
                  </a>
                </div>
              </div>

              <div className="relative h-64 lg:h-72 w-full rounded-2xl overflow-hidden border-4 border-white/20 shadow-lg bg-[#FDF2F8]">
                <img 
                  src="/adult_banner.png" 
                  alt="Cơ hội thăng tiến cùng tiếng Anh" 
                  className="w-full h-full object-cover object-top" 
                />
              </div>
            </div>
          </div>

          {/* Section: LỘ TRÌNH HỌC TIẾNG ANH GIAO TIẾP CHO NGƯỜI ĐI LÀM */}
          <div className="mt-24">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              LỘ TRÌNH HỌC CHO NGƯỜI ĐI LÀM
            </h2>

            <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-8 mt-12 relative">
              {[
                { 
                  step: '01', 
                  title: 'BEGINNER', 
                  sub: 'MẤT GỐC / CƠ BẢN',
                  pts: ['Phát âm cơ bản tiếng Anh', 'Từ vựng thông dụng công việc', 'Giao tiếp văn phòng cơ bản'],
                  aim: 'Mục tiêu: Giao tiếp đơn giản, hiểu và nói các câu cơ bản văn phòng.'
                },
                { 
                  step: '02', 
                  title: 'ELEMENTARY', 
                  sub: 'GIAO TIẾP NỀN TẢNG',
                  pts: ['Mô tả công việc chi tiết', 'Viết email công việc đơn giản', 'Trao đổi hằng ngày với đồng nghiệp'],
                  aim: 'Mục tiêu: Giao tiếp tốt hơn trong các tình huống công sở.'
                },
                { 
                  step: '03', 
                  title: 'INTERMEDIATE', 
                  sub: 'GIAO TIẾP CÔNG VỰC',
                  pts: ['Tham gia cuộc họp tiếng Anh', 'Trình bày ý tưởng mạch lạc', 'Báo cáo & phản hồi thông tin'],
                  aim: 'Mục tiêu: Tự tin giao tiếp và tham gia meeting bằng tiếng Anh.'
                },
                { 
                  step: '04', 
                  title: 'ADVANCED', 
                  sub: 'TIẾNG ANH CHUYÊN NGHIỆP',
                  pts: ['Thuyết trình dự án chuyên nghiệp', 'Đàm phán & thương lượng giá', 'Làm việc trực tiếp đối tác quốc tế'],
                  aim: 'Mục tiêu: Sử dụng tiếng Anh tự tin trong môi trường quốc tế.'
                }
              ].map((path, idx) => (
                <div key={idx} className="relative group">
                  {/* Arrow indicator for step flow */}
                  {idx < 3 && (
                    <>
                      {/* Desktop Right Arrow */}
                      <div className="hidden lg:block absolute -right-6 top-1/2 -translate-y-1/2 z-10 text-slate-900 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm transform group-hover:translate-x-1 transition-transform duration-300">
                        <ArrowRight className="w-4 h-4 stroke-[3]" />
                      </div>
                      {/* Mobile/Tablet Down Arrow */}
                      <div className="lg:hidden md:hidden flex justify-center my-3 text-slate-950">
                        <ChevronDown className="w-5 h-5 stroke-[3]" />
                      </div>
                    </>
                  )}
                  
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-amber-300 hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full relative">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4 font-quicksand">
                        <span className="font-extrabold text-3xl text-[#D97706]">{path.step}</span>
                        <div className="text-right">
                          <span className="font-black text-xs text-slate-800 block uppercase tracking-wider">{path.title}</span>
                          <span className="text-[9px] text-[#D97706] font-bold uppercase tracking-wider">{path.sub}</span>
                        </div>
                      </div>

                      <ul className="space-y-2.5 font-jakarta font-semibold text-xs text-slate-500 mb-6">
                        {path.pts.map((pt, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-1.5">
                            <Check className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-[#FFFBEB] p-3 rounded-xl border border-[#FDE68A]/40 text-[10px] font-bold text-[#b45309] leading-relaxed">
                      {path.aim}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews Row */}
          <div className="mt-24">
            <h3 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight">
              HỌC VIÊN NÓI GÌ VỀ <span className="text-[#2563EB]">123ENGLISH</span>?
            </h3>
            
            <div className="grid lg:grid-cols-3 gap-6 mt-10">
              {[
                { name: 'Minh Tuấn', role: 'Nhân viên IT', text: 'Sau 4 tháng học 1 kèm 1 với giáo viên nước ngoài tại 123English, tôi đã tự tin hơn hẳn khi tham gia các cuộc họp trực tuyến với khách hàng Mỹ và có thể trực tiếp giải thích tiến độ công việc.', stars: 5 },
                { name: 'Khánh Linh', role: 'Nhân viên Marketing', text: 'Bài học thiết kế rất sát với công việc Marketing thực tế của tôi. Giáo viên nhiệt tình sửa lỗi ngữ pháp viết email và hướng dẫn cách thuyết trình sản phẩm thu hút.', stars: 5 },
                { name: 'Hoàng Nam', role: 'Kỹ sư cơ khí', text: 'Học online 1-1 giúp tôi luyện phản xạ nói tối đa, tiết kiệm thời gian di chuyển. Tôi giờ có thể đọc hiểu tài liệu kỹ thuật tiếng Anh và trao đổi cơ bản với chuyên gia ngoại quốc.', stars: 5 }
              ].map((testi, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                    <div>
                      <h4 className="font-jakarta font-bold text-sm text-slate-800">{testi.name}</h4>
                      <span className="text-[10px] text-slate-400 font-bold">{testi.role}</span>
                    </div>
                    <div className="flex gap-0.5 text-amber-400">
                      {Array.from({ length: testi.stars }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed italic">"{testi.text}"</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section: CÂU HỎI THƯỜNG GẶP */}
          <div className="mt-28 max-w-5xl mx-auto">
            <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-2 mb-10">
              <HelpCircle className="w-8 h-8 text-[#D97706]" />
              CÂU HỎI THƯỜNG GẶP
            </h2>

            <div className="grid md:grid-cols-2 gap-4 items-start mt-10">
              {/* Column 1 */}
              <div className="space-y-3 font-jakarta font-bold text-sm">
                {[
                  { q: 'Học online có hiệu quả không?', a: 'Khóa học 1 kèm 1 tương tác trực tiếp giúp học viên thực hành nói liên tục 100% thời gian học, giáo viên chỉnh sửa lỗi phát âm và phản xạ lập tức, hiệu quả cao gấp 4 lần lớp học thông thường.', idx: 0 },
                  { q: 'Tôi đi làm bận rộn có học được không?', a: 'Có, khung giờ học vô cùng linh hoạt từ 8:00 đến 23:00 mỗi ngày. Học viên tự chọn lịch rảnh hàng tuần và có thể xin nghỉ/đổi lịch học trước buổi học tối thiểu 2-4 tiếng.', idx: 1 },
                  { q: 'Học phí có xuất hóa đơn đỏ không?', a: 'Có, 123English hỗ trợ cung cấp hóa đơn giá trị gia tăng (VAT) cho doanh nghiệp thanh toán tiền học phí cho cán bộ nhân viên học tập.', idx: 2 }
                ].map((faq) => (
                  <div key={faq.idx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setFaqNguoiDiLamIndex(faqNguoiDiLamIndex === faq.idx ? null : faq.idx)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-slate-50 transition-colors text-slate-800 font-semibold"
                    >
                      <span className="text-xs sm:text-sm">{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${faqNguoiDiLamIndex === faq.idx ? 'rotate-180 text-[#D97706]' : ''}`} />
                    </button>
                    {faqNguoiDiLamIndex === faq.idx && (
                      <div className="px-5 pb-5 pt-1 text-slate-500 font-medium text-xs leading-relaxed border-t border-slate-50 bg-[#FFFBEB]/20">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Column 2 */}
              <div className="space-y-3 font-jakarta font-bold text-sm">
                {[
                  { q: 'Tôi mất gốc thì bắt đầu học như thế nào?', a: 'Bạn sẽ được kiểm tra trình độ đầu vào miễn phí. Giáo viên sẽ thiết kế lộ trình bắt đầu từ phần phát âm, từ vựng công sở cơ bản nhất để bạn dễ dàng bắt nhịp.', idx: 3 },
                  { q: 'Giáo viên gồm những nước nào?', a: 'Đội ngũ giáo viên gồm các thầy cô Philippines giàu kinh nghiệm, giáo viên Bản xứ (Mỹ, Anh, Úc) và giáo viên Việt Nam có chứng chỉ IELTS/TOEIC giảng dạy chuyên sâu.', idx: 4 }
                ].map((faq) => (
                  <div key={faq.idx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setFaqNguoiDiLamIndex(faqNguoiDiLamIndex === faq.idx ? null : faq.idx)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-slate-50 transition-colors text-slate-800 font-semibold"
                    >
                      <span className="text-xs sm:text-sm">{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${faqNguoiDiLamIndex === faq.idx ? 'rotate-180 text-[#D97706]' : ''}`} />
                    </button>
                    {faqNguoiDiLamIndex === faq.idx && (
                      <div className="px-5 pb-5 pt-1 text-slate-500 font-medium text-xs leading-relaxed border-t border-slate-50 bg-[#FFFBEB]/20">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Footer CTA Banner (Yellow-Orange Split Design) */}
          <div className="mt-24 bg-gradient-to-r from-amber-500 to-orange-500 rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden shadow-xl text-white border border-amber-400">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 right-20 w-52 h-52 bg-orange-600/20 rounded-full blur-2xl pointer-events-none" />
            
            <div className="max-w-7xl mx-auto grid lg:grid-cols-[55%_45%] gap-8 items-center relative z-10">
              
              {/* Left Side: Business Woman Photo & Content */}
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-44 h-44 rounded-3xl overflow-hidden border-4 border-white shadow-lg shrink-0 bg-white">
                  <img src="/adult_footer.png" alt="Học viên người đi làm" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="inline-block px-3 py-1 bg-white/25 text-white font-extrabold text-[10px] rounded-full uppercase tracking-wider mb-3 font-quicksand">
                    TIẾNG ANH NGƯỜI ĐI LÀM
                  </span>
                  <h3 className="font-quicksand font-extrabold text-2xl sm:text-3xl leading-tight">
                    Đăng ký học thử miễn phí ngay!
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm font-semibold opacity-90 leading-relaxed">
                    Đầu tư cho năng lực tiếng Anh hôm nay, mở rộng cơ hội phát triển sự nghiệp vượt bậc cho tương lai ngày mai.
                  </p>
                  
                  <div className="mt-4 flex flex-col gap-1.5 font-jakarta font-bold text-xs">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-white" />
                      <span>Hotline liên hệ trực tiếp: 0388.827.295</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: White Registration Card */}
              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 text-slate-800">
                <form onSubmit={(e) => handleSignupSubmit(e, 'Tiếng Anh Người Đi Làm (Footer)')} className="space-y-3">
                  <input 
                    type="tel" 
                    required
                    value={formBottomNguoiDiLam.phone}
                    onChange={(e) => setFormBottomNguoiDiLam({...formBottomNguoiDiLam, phone: e.target.value})}
                    placeholder="Nhập số điện thoại của bạn *"
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#D97706] font-medium text-slate-900"
                  />
                  <button 
                    type="submit"
                    className="w-full px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-quicksand font-bold rounded-xl text-center text-xs tracking-wider uppercase transition-all duration-200 shadow-md font-semibold"
                  >
                    ĐĂNG KÝ HỌC THỬ MIỄN PHÍ NGAY
                  </button>
                </form>
              </div>

            </div>
          </div>

        </div>
      </section>
        </>
      )}

      {/* COMPACT FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-6 shrink-0 z-10 relative">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            © 2026 Hộ kinh doanh Gia Sư Toàn Năng
          </div>
          
          <div className={`flex items-center gap-6 text-[11px] font-bold font-quicksand ${
            landingType === 'kids' ? 'text-[#10B981]' :
            landingType === 'teens' ? 'text-[#2563EB]' :
            'text-[#D97706]'
          }`}>
            {landingType === 'kids' && (
              <>
                <a href="#trang-chu" className="hover:underline">Trang chủ</a>
                <a href="#chuong-trinh" className="hover:underline">Chương trình</a>
                <a href="#lo-trinh" className="hover:underline">Lộ trình</a>
              </>
            )}
            {landingType === 'teens' && (
              <>
                <a href="#trang-chu" className="hover:underline">Trang chủ</a>
                <a href="#chuong-trinh" className="hover:underline">Chương trình</a>
                <a href="#mat-goc-quay" className="hover:underline">Quay thưởng</a>
              </>
            )}
            {landingType === 'adults' && (
              <>
                <a href="#trang-chu" className="hover:underline">Trang chủ</a>
                <a href="#chuong-trinh" className="hover:underline">Chương trình</a>
                <a href="#dao-tao" className="hover:underline">Đào tạo</a>
              </>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-500 font-medium">
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Chính sách bảo mật</span>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Điều khoản sử dụng</span>
            <a href="https://facebook.com/123englishinvietnam" target="_blank" rel="noopener noreferrer" className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black transition-colors font-bold text-[9px]">f</a>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* DIALOG MODALS                                                             */}
      {/* ========================================================================= */}

      {/* Progress Search Modal */}
      <Modal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        title="Tra cứu tiến độ học tập"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200/50 p-4 rounded-2xl">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0 text-blue-600">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-jakarta font-bold text-xs sm:text-sm text-slate-800">Dành cho phụ huynh & học sinh</h4>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Kiểm tra kết quả buổi học, bài tập & nhận xét</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Mã học sinh</label>
              <div className="relative font-jakarta font-bold">
                <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchProgress()}
                  placeholder="Ví dụ: HS123456"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-all text-xs"
                />
              </div>
              <p className="text-[9px] text-slate-400 mt-1.5 leading-normal">* Mã học sinh do giáo viên hoặc quản trị viên cung cấp cho gia đình.</p>
            </div>

            <button
              onClick={handleSearchProgress}
              className="w-full py-4.5 bg-[#2563EB] hover:bg-blue-700 text-white font-quicksand font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <Search className="w-4 h-4" /> Xem tiến độ học tập
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold bg-slate-50 py-2.5 rounded-lg border border-slate-100/50">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Tra cứu an toàn, không cần đăng nhập
          </div>
        </div>
      </Modal>

      {/* Login Modal */}
      <Modal
        open={loginRole !== null}
        onClose={() => setLoginRole(null)}
        title={loginRole === 'teacher' ? 'Đăng nhập Giáo viên' : 'Đăng nhập Quản trị viên'}
        size="sm"
      >
        <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
          
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/50 p-4 rounded-2xl mb-2">
            <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center shrink-0 text-slate-700">
              {loginRole === 'teacher' ? <GraduationCap className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="font-jakarta font-bold text-xs sm:text-sm text-slate-800">Cổng đăng nhập nội bộ</h4>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Vui lòng sử dụng tài khoản được cấp</p>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-600 font-bold">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              {loginRole === 'teacher' ? 'Mã giáo viên' : 'Tên đăng nhập'}
            </label>
            <div className="relative font-jakarta font-bold">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={loginRole === 'teacher' ? 'Ví dụ: GVMLLNBR' : 'Nhập tên đăng nhập'}
                autoComplete="username"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-all text-xs"
                {...registerLogin('username')}
              />
            </div>
            {loginErrors.username && <p className="mt-1.5 text-[10px] text-rose-500 font-bold">{loginErrors.username.message}</p>}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Mật khẩu</label>
            <div className="relative font-jakarta font-bold">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu truy cập"
                autoComplete="current-password"
                className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-all text-xs"
                {...registerLogin('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {loginErrors.password && <p className="mt-1.5 text-[10px] text-rose-500 font-bold">{loginErrors.password.message}</p>}
          </div>

          {loginRole === 'teacher' ? (
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
              <div className="text-[10px] text-[#2563EB] font-bold bg-[#EFF6FF] border border-[#BFDBFE]/60 px-3 py-1.5 rounded-lg">
                Đăng nhập bằng mã giáo viên
              </div>
              <button 
                type="button"
                onClick={() => openLogin('admin')}
                className="text-[10px] text-slate-500 hover:text-slate-800 font-bold flex items-center gap-0.5"
              >
                Đăng nhập Admin
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 font-bold">
                Cổng dành cho Quản trị viên hệ thống.
              </div>
              <button 
                type="button"
                onClick={() => openLogin('teacher')}
                className="text-[10px] text-slate-500 hover:text-slate-800 font-bold flex items-center gap-0.5"
              >
                Đăng nhập Giáo viên
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoginSubmitting}
            className="w-full mt-4 py-4 bg-slate-900 hover:bg-black text-white font-quicksand font-bold rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center disabled:opacity-50 text-xs uppercase tracking-wider"
          >
            {isLoginSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Đăng nhập hệ thống'
            )}
          </button>
        </form>
      </Modal>

      {/* Prize Claim Modal (Wheel of Fortune success) */}
      <Modal
        open={showPrizeModal}
        onClose={() => setShowPrizeModal(false)}
        title="Chúc mừng trúng thưởng! 🎉"
        size="sm"
      >
        <div className="space-y-4 text-center font-jakarta">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center text-white mx-auto shadow-lg animate-bounce">
            <Gift className="w-10 h-10 stroke-[2]" />
          </div>

          <div>
            <h4 className="font-outfit font-black text-lg text-slate-800">BẠN ĐÃ TRÚNG THƯỞNG HỌC BỔNG</h4>
            <div className="inline-block px-6 py-3.5 bg-[#ECFDF5] border-2 border-[#A7F3D0] rounded-2xl text-[#059669] font-outfit font-black text-xl tracking-wide mt-3 shadow-sm">
              {prizeIndex !== null && sectors[prizeIndex].labelLines.join(' ')}
            </div>
          </div>

          <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-sm mx-auto">
            Vui lòng cung cấp số điện thoại Zalo để nhận mã quà tặng ưu đãi học tập 1 kèm 1 đặc quyền của bạn.
          </p>

          <form onSubmit={handleClaimPrizeSubmit} className="space-y-3 pt-2 text-left">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Số điện thoại nhận quà</label>
              <input 
                type="tel" 
                required
                value={claimPhone}
                onChange={(e) => setClaimPhone(e.target.value)}
                placeholder="Nhập số điện thoại liên hệ *"
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#10B981] font-bold"
              />
            </div>

            <button
              type="submit"
              disabled={claimSuccess}
              className="w-full py-4.5 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider font-outfit shadow-md disabled:opacity-50"
            >
              {claimSuccess ? 'Đang gửi...' : 'NHẬN MÃ ƯU ĐÃI NGAY'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </Modal>

      {/* Global Success Notification Modal */}
      {successMsg && (
        <Modal
          open={successMsg !== null}
          onClose={() => setSuccessMsg(null)}
          title="Đăng ký thành công! 🎉"
          size="md"
        >
          <div className="space-y-4 text-center font-jakarta">
            <div className="w-16 h-16 bg-[#ECFDF5] text-[#059669] rounded-full flex items-center justify-center mx-auto border border-[#A7F3D0]">
              <Check className="w-8 h-8 stroke-[3.5]" />
            </div>
            
            <p className="text-sm text-slate-700 font-bold leading-relaxed max-w-md mx-auto">
              {successMsg}
            </p>

            <button
              onClick={() => setSuccessMsg(null)}
              className="mt-6 px-6 py-3 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors"
            >
              Đồng ý
            </button>
          </div>
        </Modal>
      )}

    </div>
  )
}
