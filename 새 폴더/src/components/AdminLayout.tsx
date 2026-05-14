import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LayoutDashboard, PlusCircle, LogOut, FileText, ChevronRight, ExternalLink, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { Survey } from '../types';
import { ADMIN_EMAILS } from '../constants';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [recentSurveys, setRecentSurveys] = useState<Survey[]>([]);

  const [sidebarGroupMode, setSidebarGroupMode] = useState<'none' | 'status' | 'tag'>('none');
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const isAdmin = ADMIN_EMAILS.includes(auth.currentUser.email || '');
    
    const q = isAdmin
      ? query(collection(db, 'surveys'))
      : query(
          collection(db, 'surveys'),
          where('createdBy', '==', auth.currentUser.uid)
        );
        
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecentSurveys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'surveys');
    });
    return unsubscribe;
  }, []);

  const sortedSurveys = [...recentSurveys].sort((a, b) => b.createdAt - a.createdAt);

  const groupedSidebarSurveys: Record<string, Survey[]> = sidebarGroupMode === 'status'
    ? sortedSurveys.reduce((acc, s) => {
        const group = s.status;
        if (!acc[group]) acc[group] = [];
        acc[group].push(s);
        return acc;
      }, {} as Record<string, Survey[]>)
    : sidebarGroupMode === 'tag'
    ? sortedSurveys.reduce((acc, s) => {
        const group = s.groupTag || '기타';
        if (!acc[group]) acc[group] = [];
        acc[group].push(s);
        return acc;
      }, {} as Record<string, Survey[]>)
    : { all: sortedSurveys };

  const handleLogout = () => {
    auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#e2e8f0] bg-white flex flex-col overflow-y-auto custom-scrollbar">
        <div className="p-8">
          <div className="flex items-center gap-2 text-[#4f46e5]">
            <PlusCircle size={24} fill="currentColor" className="text-[#4f46e5]/10" />
            <h1 className="font-bold text-lg tracking-tight">폼 마스터</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <Link to="/admin" className={`nav-item-bento ${location.pathname === '/admin' ? 'nav-item-active' : ''}`}>
            <LayoutDashboard size={18} />
            <span>대시보드</span>
          </Link>
          <Link to="/admin/builder" className={`nav-item-bento ${location.pathname.includes('/builder') ? 'nav-item-active' : ''}`}>
            <PlusCircle size={18} />
            <span>폼 빌더</span>
          </Link>

          <div className="pt-6 pb-2 px-4 flex items-center justify-between group/title">
            <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">설문 목록</span>
            <button 
              onClick={() => setSidebarGroupMode(prev => prev === 'tag' ? 'none' : 'tag')}
              className={`text-[9px] font-bold px-2 py-1 rounded border transition-all ${sidebarGroupMode === 'tag' ? 'bg-[#4f46e5] text-white border-transparent' : 'text-[#64748b] border-[#e2e8f0] hover:border-[#4f46e5]/30'}`}
              title="그룹별로 묶어보기"
            >
              그룹화 보기
            </button>
          </div>
          <div className="space-y-4 px-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {Object.entries(groupedSidebarSurveys).map(([group, surveys]) => (
              <div key={group} className="space-y-1">
                {sidebarGroupMode !== 'none' && (
                  <div className="px-2 py-1">
                    <span className="text-[9px] font-black text-[#94a3b8] uppercase bg-[#f8fafc] px-2 py-0.5 rounded border border-[#e2e8f0]">
                      {group === 'active' ? '진행중' : group === 'draft' ? '대기' : group === 'closed' ? '마감' : group}
                    </span>
                  </div>
                )}
                {surveys.map(s => (
                  <Link 
                    key={s.id} 
                    to={`/admin/builder/${s.id}`} 
                    className={`flex-1 flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-[#64748b] hover:text-[#4f46e5] hover:bg-[#eef2ff] rounded-xl transition-all group/item ${location.pathname.includes(s.id) ? 'bg-[#eef2ff] text-[#4f46e5]' : ''}`}
                  >
                    <FileText size={12} className="opacity-50 shrink-0" />
                    <span className="truncate flex-1">{s.title}</span>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(`/s/${s.id}`, '_blank');
                      }}
                      className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-white rounded transition-all text-[#94a3b8] hover:text-[#4f46e5]"
                      title="미리보기"
                    >
                      <Eye size={12} />
                    </button>
                    <ChevronRight size={10} className="opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            ))}
            {recentSurveys.length === 0 && (
              <div className="px-4 py-2 text-[10px] text-[#94a3b8] italic text-center">진행 중인 설문이 없습니다</div>
            )}
          </div>


        </nav>

        <div className="p-4 border-t border-[#e2e8f0]">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 text-[#f43f5e] hover:bg-[#fff1f2] rounded-xl transition-all font-medium text-sm">
            <LogOut size={18} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        <header className="h-20 bg-[#f1f5f9]/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-8">
          <div>
             <h2 className="text-xl font-bold tracking-tight">워크스페이스 개요</h2>
             <p className="text-xs text-[#64748b]">환영합니다, {auth.currentUser?.email?.split('@')[0]}님</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex flex-col items-end mr-2">
                <span className="text-xs font-bold">{auth.currentUser?.email}</span>
                <span className="text-[10px] text-[#22c55e] font-bold uppercase">System Active</span>
             </div>
             <div className="w-10 h-10 bg-[#eef2ff] border border-[#e2e8f0] rounded-xl flex items-center justify-center text-[#4f46e5] font-bold">
               {auth.currentUser?.email?.[0].toUpperCase()}
             </div>
          </div>
        </header>
        <div className="p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
