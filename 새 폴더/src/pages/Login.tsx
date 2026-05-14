import { loginWithGoogle } from '../lib/firebase';
import { LogIn, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#f1f5f9] p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bento-card p-12 flex flex-col items-center text-center space-y-8"
      >
        <div className="w-16 h-16 bg-[#4f46e5] text-white flex items-center justify-center rounded-2xl shadow-lg ring-8 ring-[#eef2ff]">
          <ShieldCheck size={32} />
        </div>
        
        <div>
          <h1 className="text-3xl font-extrabold text-[#0f172a] mb-2 tracking-tight">EduSurvey Pro</h1>
          <p className="text-sm font-semibold text-[#64748b] uppercase tracking-widest">관리자 인증</p>
        </div>

        <button 
          onClick={loginWithGoogle}
          className="btn-primary w-full justify-center py-4 text-sm group"
        >
          <LogIn size={20} className="group-hover:rotate-12 transition-transform" />
          Google 계정으로 계속하기
        </button>

        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest leading-relaxed">
          Authorized personnel only. All access is logged.
        </p>
      </motion.div>
    </div>
  );
}
