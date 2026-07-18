import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AppScreen, UserProfile, CosmeticItem } from './types';
import { INITIAL_COSMETIC_ITEMS } from './data';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import HomeView from './components/HomeView';
import ShopView from './components/ShopView';
import ProfileView from './components/ProfileView';
import EditProfileView from './components/EditProfileView';
import PlayView from './components/PlayView';
import PremiumModal from './components/PremiumModal';
import AuthView from './components/AuthView';
import { Home, Gamepad2, ShoppingBag, User, Coins, LogOut } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001';

export default function App() {
  // --- Navigation & Flow State ---
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.HOME);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [roomCodeToJoin, setRoomCodeToJoin] = useState<string>('');

  // --- Auth State ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('studyclash_logged_in') === 'true';
  });

  // --- Core User Profile State ---
  const [user, setUser] = useState<UserProfile>(() => {
    const savedUser = localStorage.getItem('studyclash_current_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        // Fallback
      }
    }
    return {
      username: 'ProfeGamer_99',
      institution: 'Instituto Tecnológico de Innovación',
      bio: 'Amante de los desafíos de estudio, los videojuegos de trivia y el café cargado de medianoche.',
      level: 5,
      xp: 2400,
      maxXp: 3000,
      coins: 150,
      avatarId: 'cyber_scholar',
      credits: 5,
      isPremium: false
    };
  });

  // --- Cosmetics State ---
  const [cosmetics, setCosmetics] = useState<CosmeticItem[]>(INITIAL_COSMETIC_ITEMS);

  // --- Computed Active Avatar Image ---
  const activeAvatarImage = cosmetics.find(c => c.id === user.avatarId)?.image || cosmetics[0].image;

  // --- Premium activation handler ---
  const handleActivatePremium = async (preferenceId: string, collectionId?: string) => {
    if (!user.email) {
      throw new Error('El correo del usuario es necesario para activar Premium.');
    }

    const response = await fetch(`${API_BASE_URL}/api/payments/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        preferenceId,
        collectionId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error ?? 'No se pudo activar Premium.');
    }

    const updatedUser = payload.user;
    if (!updatedUser) {
      throw new Error('No se recibió información de usuario actualizada.');
    }

    setUser((prev) => {
      const nextUser = {
        ...prev,
        ...updatedUser,
      };
      localStorage.setItem('studyclash_current_user', JSON.stringify(nextUser));
      return nextUser;
    });

    setCosmetics((prev) =>
      prev.map((item) =>
        item.isPremiumExclusive
          ? { ...item, status: 'unlocked' }
          : item,
      ),
    );

    setIsPremiumOpen(false);
  };

  // --- Transaction: Buy Cosmetic Skin ---
  const handleBuyCosmetic = (id: string, price: number): boolean => {
    if (user.coins >= price) {
      // Deduct coins
      setUser(prev => ({
        ...prev,
        coins: prev.coins - price
      }));

      // Unlock cosmetic item
      setCosmetics(prev => 
        prev.map(item => {
          if (item.id === id) {
            return {
              ...item,
              status: 'unlocked'
            };
          }
          return item;
        })
      );
      return true;
    }
    return false;
  };

  // --- Action: Equip Cosmetic Skin ---
  const handleEquipCosmetic = (id: string) => {
    // 1. Update user active avatarId
    setUser(prev => ({
      ...prev,
      avatarId: id
    }));

    // 2. Cycle cosmetic array to make selected item 'equipped' and others 'unlocked'
    setCosmetics(prev => 
      prev.map(item => {
        if (item.type === 'skin') {
          if (item.id === id) {
            return { ...item, status: 'equipped' };
          } else if (item.status === 'equipped') {
            return { ...item, status: 'unlocked' };
          }
        }
        return item;
      })
    );
  };

  // --- Reward Callback: Completed Trivia Match ---
  const handleCompleteGame = (correct: number, points: number, xpGained: number, coinsGained: number) => {
    setUser(prev => {
      let newXp = prev.xp + xpGained;
      let newLevel = prev.level;
      let newMaxXp = prev.maxXp;

      // Handle leveling up
      if (newXp >= newMaxXp) {
        newLevel += 1;
        newXp = newXp - newMaxXp;
        newMaxXp = Math.round(newMaxXp * 1.2); // exponential curve
      }

      return {
        ...prev,
        level: newLevel,
        xp: newXp,
        maxXp: newMaxXp,
        coins: prev.coins + coinsGained
      };
    });
  };

  // --- Developer/Admin: Fast Coins Add ---
  const handleAddCoins = (amount: number) => {
    setUser(prev => ({
      ...prev,
      coins: prev.coins + amount
    }));
  };

  // --- Save Profile Changes ---
  const handleSaveProfile = (updatedUser: Partial<UserProfile>) => {
    setUser(prev => {
      const newUser = {
        ...prev,
        ...updatedUser
      };
      localStorage.setItem('studyclash_current_user', JSON.stringify(newUser));
      return newUser;
    });
  };

  const handleLoginSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setIsLoggedIn(true);
    localStorage.setItem('studyclash_logged_in', 'true');
    localStorage.setItem('studyclash_current_user', JSON.stringify(loggedInUser));
    setCurrentScreen(AppScreen.HOME);
  };

  // --- Mock Logout Reset ---
  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.setItem('studyclash_logged_in', 'false');
    localStorage.removeItem('studyclash_current_user');
    setUser({
      username: 'ProfeGamer_99',
      institution: 'Instituto Tecnológico de Innovación',
      bio: 'Amante de los desafíos de estudio, los videojuegos de trivia y el café cargado de medianoche.',
      level: 5,
      xp: 2400,
      maxXp: 3000,
      coins: 150,
      credits: 5,
      avatarId: 'cyber_scholar',
      isPremium: false
    });
    setCosmetics(INITIAL_COSMETIC_ITEMS);
    setCurrentScreen(AppScreen.HOME);
  };

  // --- Direct Screen code navigation ---
  const renderViewContent = () => {
    switch (currentScreen) {
      case AppScreen.HOME:
        return (
          <HomeView
            user={user}
            cosmetics={cosmetics}
            onNavigate={setCurrentScreen}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onEquipCosmetic={handleEquipCosmetic}
            onJoinRoom={(code) => {
              setRoomCodeToJoin(code);
              setCurrentScreen(AppScreen.PLAY_LOBBY);
            }}
          />
        );

      case AppScreen.SHOP:
        return (
          <ShopView
            user={user}
            cosmetics={cosmetics}
            onBuyCosmetic={handleBuyCosmetic}
            onEquipCosmetic={handleEquipCosmetic}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onAddCoins={handleAddCoins}
          />
        );

      case AppScreen.PROFILE:
        return (
          <ProfileView
            user={user}
            cosmetics={cosmetics}
            activeAvatarImage={activeAvatarImage}
            onNavigate={setCurrentScreen}
            onLogout={handleLogout}
            onOpenPremium={() => setIsPremiumOpen(true)}
          />
        );

      case AppScreen.EDIT_PROFILE:
        return (
          <EditProfileView
            user={user}
            cosmetics={cosmetics}
            onSave={handleSaveProfile}
            onNavigate={setCurrentScreen}
          />
        );

      case AppScreen.PLAY_UPLOAD:
      case AppScreen.PLAY_CONFIG:
      case AppScreen.PLAY_LOBBY:
      case AppScreen.PLAY_GAME:
      case AppScreen.PLAY_GAMEOVER:
        return (
          <PlayView
            user={user}
            activeAvatarImage={activeAvatarImage}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onNavigate={setCurrentScreen}
            onCompleteGame={handleCompleteGame}
            cosmetics={cosmetics} // Pass cosmetics down
            currentScreen={currentScreen}
            setCurrentScreen={setCurrentScreen}
            joinRoomCode={roomCodeToJoin}
          />
        );

      default:
        return <div className="text-center py-10">Vista no encontrada.</div>;
    }
  };

  // Determine sidebar active tabs
  const isHomeActive = currentScreen === AppScreen.HOME;
  const isPlayActive = [
    AppScreen.PLAY_UPLOAD,
    AppScreen.PLAY_CONFIG,
    AppScreen.PLAY_LOBBY,
    AppScreen.PLAY_GAME,
    AppScreen.PLAY_GAMEOVER
  ].includes(currentScreen);
  const isShopActive = currentScreen === AppScreen.SHOP;
  const isProfileActive = currentScreen === AppScreen.PROFILE || currentScreen === AppScreen.EDIT_PROFILE;

  if (!isLoggedIn) {
    return <AuthView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#090d16] text-[#1e293b] dark:text-[#f8fafc] flex flex-col font-sans transition-colors duration-300">
      
      {/* 1. Global Header */}
      <Header
        user={user}
        activeAvatarImage={activeAvatarImage}
        onOpenPremium={() => setIsPremiumOpen(true)}
        onNavigateToProfile={() => setCurrentScreen(AppScreen.PROFILE)}
        onNavigateToHome={() => setCurrentScreen(AppScreen.HOME)}
      />

      {/* 2. Main Layout containing sidebar for desktop and container scroll views */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        
        {/* Left Sidebar (Desktop/Tablet Only) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-gray-100 dark:border-gray-800/50 p-6 space-y-6 flex-shrink-0">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-3">
              MENÚ PRINCIPAL
            </span>
            <nav className="space-y-1">
              {/* Home */}
              <button
                onClick={() => setCurrentScreen(AppScreen.HOME)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-semibold text-sm transition-all bouncy-tap ${
                  isHomeActive
                    ? 'bg-[#2b6cb0] text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/40'
                }`}
              >
                <Home size={18} className={isHomeActive ? 'fill-current' : ''} />
                <span>Panel de Control</span>
              </button>

              {/* Play / Create */}
              <button
                onClick={() => setCurrentScreen(AppScreen.PLAY_UPLOAD)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-semibold text-sm transition-all bouncy-tap ${
                  isPlayActive
                    ? 'bg-[#2b6cb0] text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/40'
                }`}
              >
                <Gamepad2 size={18} />
                <span>Iniciar Desafío</span>
              </button>

              {/* Shop */}
              <button
                onClick={() => setCurrentScreen(AppScreen.SHOP)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-semibold text-sm transition-all bouncy-tap ${
                  isShopActive
                    ? 'bg-[#2b6cb0] text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/40'
                }`}
              >
                <ShoppingBag size={18} className={isShopActive ? 'fill-current' : ''} />
                <span>Tienda de Skins</span>
              </button>

              {/* Profile */}
              <button
                onClick={() => setCurrentScreen(AppScreen.PROFILE)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-semibold text-sm transition-all bouncy-tap ${
                  isProfileActive
                    ? 'bg-[#2b6cb0] text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/40'
                }`}
              >
                <User size={18} className={isProfileActive ? 'fill-current' : ''} />
                <span>Mi Historial</span>
              </button>
            </nav>
          </div>

          {/* Quick Coin Status for Desktop */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-4 rounded-3xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500 fill-amber-500" />
              <div>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wide">Monedas</p>
                <p className="font-mono text-base font-black text-amber-700 dark:text-amber-400 leading-none mt-0.5">{user.coins}</p>
              </div>
            </div>
          </div>

          {/* Logout spacer */}
          <div className="pt-8 mt-auto">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/10 transition-colors bouncy-tap"
            >
              <LogOut size={16} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </aside>

        {/* 3. Primary Content Panel */}
        <main className="flex-1 px-4 py-6 md:p-8 overflow-y-auto mb-20 md:mb-0">
          <AnimatePresence mode="wait">
            {renderViewContent()}
          </AnimatePresence>
        </main>
      </div>

      {/* 4. Global Mobile Bottom Navigation Bar */}
      <BottomNav
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
      />

      {/* 5. Go Premium Interactive Modal */}
      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        isPremium={user.isPremium}
        username={user.username}
        userEmail={user.email}
        onPurchaseSuccess={handleActivatePremium}
      />
    </div>
  );
}
