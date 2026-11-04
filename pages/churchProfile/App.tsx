/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useNav } from '../../lib/NavContext';
import { ChurchProvider, useChurch } from './context/ChurchContext';
import { Navigation } from './components/Navigation';
import { MemberProfileView } from './components/MemberProfileView';
import { ProfileModalCrop } from './components/ProfileModalCrop';
import { EditProfileModal } from './components/EditProfileModal';
import { DirectoryModal } from './components/DirectoryModal';
import { X, MessageSquare, Bell } from 'lucide-react';

function ChurchProfileApp() {
  const {
    pushToast,
    dismissPushToast,
    isDirectoryModalOpen,
    closeDirectoryModal,
  } = useChurch();
  const { isSidebarOpen } = useNav();

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-gray-700 flex flex-col font-sans">
      {/* Top Bar Navigation for Member Profile */}
      <Navigation />
      <div className="flex flex-1 min-w-0">
        <div
          aria-hidden
          className={`hidden lg:block shrink-0 ${isSidebarOpen ? 'w-64' : 'w-0'}`}
          style={{
            transitionProperty: 'width',
            transitionDuration: '380ms',
            transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
        <div className="flex-1 min-w-0 flex flex-col">
      {pushToast && (
        <div className="fixed top-24 right-4 z-50 max-w-sm w-full bg-white rounded-[1.5rem] p-4 border border-gray-100 shadow-[0_30px_80px_rgba(0,0,0,0.12)]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-burgundy/5 text-burgundy shrink-0">
              {pushToast.type === 'direct_message' ? (
                <MessageSquare className="w-5 h-5" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-ink truncate">{pushToast.title}</h4>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
                {pushToast.body}
              </p>
              {pushToast.type === 'direct_message' && (
                <button
                  onClick={() => {
                    dismissPushToast();
                  }}
                  className="mt-2 text-[11px] font-black uppercase tracking-widest text-burgundy block"
                >
                  View Message
                </button>
              )}
            </div>

            <button
              onClick={dismissPushToast}
              className="p-1 text-gray-400 hover:text-burgundy rounded-lg shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Member Profile Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        <MemberProfileView />
      </main>

      {/* Profile Modals */}
      <ProfileModalCrop />
      <EditProfileModal />
      <DirectoryModal
        isOpen={isDirectoryModalOpen}
        onClose={closeDirectoryModal}
      />

      {/* Quiet Footer */}
      <footer className="border-t border-gray-100 bg-white py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-black tracking-tight text-ink">Promised Land Christian Center</span>
            <span aria-hidden="true">&middot;</span>
            <span className="italic text-burgundy">
              &ldquo;Where Everybody is Somebody&rdquo;
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            <span>PLCC Vault</span>
          </div>
        </div>
      </footer>
        </div>
      </div>
    </div>
  );
}

class ProfileErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[church-profile]', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-8">
          <div className="max-w-md bg-white border border-stone-200 rounded-2xl p-8 space-y-3">
            <h1 className="text-lg font-bold text-stone-900">This profile hit a problem.</h1>
            <p className="text-sm text-stone-600">
              The household name and address may still have saved. Reload to open the profile again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#1d372c] rounded-xl"
            >
              Reload profile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ChurchProvider>
      <ProfileErrorBoundary>
        <ChurchProfileApp />
      </ProfileErrorBoundary>
    </ChurchProvider>
  );
}
