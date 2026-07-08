import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { ref, onValue, get } from 'firebase/database';
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
        unsubscribeProfile = onValue(userProfileRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile({
              uid: user.uid,
              ...snapshot.val()
            } as UserProfile);
          } else {
            setUserProfile(null);
          }
        });

        // Check if user is Admin
        try {
          const adminConfigRef = ref(db, 'adminConfig');
          const adminSnap = await get(adminConfigRef);
          if (adminSnap.exists()) {
            const adminUid = adminSnap.val().adminUid;
            setIsAdmin(user.uid === adminUid);
          } else {
            setIsAdmin(false);
          }
        } catch (err) {
          console.error('Error fetching admin status:', err);
          setIsAdmin(false);
        }
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
