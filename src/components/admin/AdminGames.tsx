import React, { useEffect, useState } from 'react';
import { ref, get, set, update, remove, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface Game {
  id: string;
  name: string;
  imageUrl: string;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminGames: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'games'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        setGames(list);
      } else {
        setGames([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const handleOpenAdd = () => {
    setEditId(null);
    setName('');
    setImageUrl('');
    setImageFile(null);
    setMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (game: Game) => {
    setEditId(game.id);
    setName(game.name);
    setImageUrl(game.imageUrl);
    setImageFile(null);
    setMsg(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this game?')) return;
    try {
      await remove(ref(db, `games/${id}`));
      alert('Game deleted successfully.');
      fetchGames();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMsg({ text: 'Game name is required.', type: 'warning' });
      return;
    }
    if (!imageUrl.trim() && !imageFile && !editId) {
      setMsg({ text: 'Image URL or Upload required.', type: 'warning' });
      return;
    }

    setUploading(true);
    setMsg(null);
    let finalUrl = imageUrl.trim();

    try {
      // Upload file to ImgBB
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        if (data.success) {
          finalUrl = data.data.url;
        } else {
          throw new Error(data.error?.message || 'ImgBB upload failed.');
        }
      }

      const gameData: any = {
        name: name.trim(),
        imageUrl: finalUrl
      };

      if (editId) {
        gameData.updatedAt = serverTimestamp();
        await update(ref(db, `games/${editId}`), gameData);
      } else {
        gameData.createdAt = serverTimestamp();
        const newRef = push(ref(db, 'games'));
        await set(newRef, gameData);
      }

      alert('Game saved successfully!');
      setShowModal(false);
      fetchGames();
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Saving failed.', type: 'danger' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-games-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Games</h2>
        <button className="btn btn-success btn-sm" onClick={handleOpenAdd}>
          <i className="bi bi-plus-circle"></i> Add Game
        </button>
      </div>

      {loading ? (
        <div className="placeholder-glow py-5 rounded-3" style={{ height: '200px' }}></div>
      ) : (
        <div className="table-responsive card custom-card">
          <table className="table table-dark table-hover mb-0">
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Game ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.length > 0 ? (
                games.map(game => (
                  <tr key={game.id}>
                    <td>
                      <img 
                        src={game.imageUrl} 
                        alt={game.name} 
                        style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
                      />
                    </td>
                    <td className="align-middle fw-bold">{game.name}</td>
                    <td className="align-middle font-monospace text-secondary small">{game.id}</td>
                    <td className="align-middle">
                      <button className="btn btn-sm btn-info me-2" onClick={() => handleOpenEdit(game)}>
                        <i className="bi bi-pencil-square"></i>
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(game.id)}>
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-secondary py-3">No games found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="custom-card p-4 mx-3" style={{ width: '100%', maxWidth: '450px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title m-0">{editId ? 'Edit Game' : 'Add New Game'}</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            <form onSubmit={handleSubmit}>
              {msg && <div className={`alert alert-${msg.type} py-2 small`}>{msg.text}</div>}

              <div className="form-group">
                <label className="form-label">Game Name</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Free Fire"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Banner Image URL</label>
                <input 
                  type="url" 
                  className="form-control"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Or Upload Image File</label>
                <input 
                  type="file" 
                  className="form-control"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn-custom btn-custom-secondary flex-grow-1" 
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-custom btn-custom-primary flex-grow-1"
                  disabled={uploading}
                >
                  {uploading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGames;
