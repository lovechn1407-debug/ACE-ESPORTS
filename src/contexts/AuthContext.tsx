import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { ref, onValue, get, set, update } from 'firebase/database';
import { auth, db } from '../firebase';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  balance: number;
  winningCash: number;
  bonusCash: number;
  totalEarnings?: number;
  gameUid?: string;
  referralCode?: string;
  referredBy?: string;
  status?: 'active' | 'blocked' | 'deleted';
  totalMatches?: number;
  wonMatches?: number;
  photoURL?: string;
  lastLogin?: number;
  createdAt?: number;
  matchHistory?: Record<string, {
    tournamentId: string;
    tournamentName: string;
    rank: number;
    kills: number;
    earnings: number;
    date: number;
  }>;
  isAdmin?: boolean;
  joinedTournaments?: Record<string, boolean>;
  usedCoupons?: Record<string, boolean>;
  notificationsEnabled?: boolean;
  referralEarnings?: number;
  lastCheckedNotifications?: number;
  appliedBadgeUrl?: string;
  appliedBadgeEffect?: string;
  appliedBadgeColor?: string;
}


interface AuthContextProps {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        // Stream the user profile in real-time
        const userProfileRef = ref(db, `users/${user.uid}`);
        const unsubProfile = onValue(userProfileRef, async (snapshot) => {
          if (snapshot.exists()) {
            const profileData = snapshot.val();
            
            // Check if admin has the buggy 999999 / negative balance profile
            if (profileData.isAdmin && (profileData.balance === 999999 || profileData.winningCash === 999999 || profileData.bonusCash === 999999)) {
              try {
                await update(userProfileRef, {
                  balance: 0,
                  winningCash: 0,
                  bonusCash: 0
                });
                profileData.balance = 0;
                profileData.winningCash = 0;
                profileData.bonusCash = 0;
              } catch (err) {
                console.error('Failed to auto-repair admin balance:', err);
              }
            }

            setUserProfile({
              uid: user.uid,
              ...profileData
            } as UserProfile);

            // Register mapping in globalUserOrgs so import works seamlessly across tenants
            try {
              const currentPath = window.location.pathname;
              const currentOrgSlug = currentPath.split('/').filter(Boolean)[0] || 'default';
              if (currentOrgSlug !== 'master') {
                const globalOrgRef = ref(db, `globalUserOrgs/${user.uid}/${currentOrgSlug}`);
                const globalOrgSnap = await get(globalOrgRef);
                if (!globalOrgSnap.exists()) {
                  const settingsSnap = await get(ref(db, 'settings'));
                  await set(globalOrgRef, settingsSnap.val()?.appName || 'Esports App');
                }
              }
            } catch (err) {
              console.error('Error writing globalUserOrgs mapping:', err);
            }
          } else {
            setUserProfile(null);
          }
        });

        // Stream the admin config in real-time to prevent race conditions during setup
        const adminConfigRef = ref(db, 'adminConfig');
        const unsubAdmin = onValue(adminConfigRef, (snapshot) => {
          if (snapshot.exists()) {
            const adminUid = snapshot.val().adminUid;
            setIsAdmin(user.uid === adminUid);
          } else {
            setIsAdmin(false);
          }
        }, (err) => {
          console.error('Error listening to admin config:', err);
          setIsAdmin(false);
        });

        unsubscribeProfile = () => {
          unsubProfile();
          unsubAdmin();
        };
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
