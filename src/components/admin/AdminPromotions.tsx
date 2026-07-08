import React, { useEffect, useState } from 'react';
import { ref, get, set, update, remove, push, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';

interface Promotion {
  id: string;
  imageUrl: string;
  link?: string;
}

const IMGBB_API_KEY = '17524c13e2cca244c03f6ad0db42e5e0';

const AdminPromotions: React.FC = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [link, setLink] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'promotions'));
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: any) => ({
          id,
          ...val
        }));
        setPromotions(list);
      } else {
        setPromotions([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const handleOpenAdd = () => {
    setEditId(null);
    setImageUrl('');
    setLink('');
    setImageFile(null);
    setMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (promo: Promotion) => {
    setEditId(promo.id);
    setImageUrl(promo.imageUrl);
    setLink(promo.link || '');
    setImageFile(null);
    setMsg(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;
    try {
      await remove(ref(db, `promotions/${id}`));
      alert('Promotion deleted.');
      fetchPromotions();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim() && !imageFile && !editId) {
      setMsg({ text: 'Image URL or File Upload is required.', type: 'warning' });
      return;
    }

    setUploading(true);
    setMsg(null);
    let finalUrl = imageUrl.trim();

    try {
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

      const promoData: any = {
        imageUrl: finalUrl,
        link: link.trim() || null
      };

      if (editId) {
        promoData.updatedAt = serverTimestamp();
        await update(ref(db, `promotions/${editId}`), promoData);
      } else {
        promoData.createdAt = serverTimestamp();
        const newRef = push(ref(db, 'promotions'));
        await set(newRef, promoData);
      }

      alert('Promotion saved successfully!');
      setShowModal(false);
      fetchPromotions();
    } catch (err: any) {
      console.error(err);
      setMsg({ text: err.message || 'Saving failed.', type: 'danger' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-promotions-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Promotions</h2>
        <button className="btn btn-success btn-sm" onClick={handleOpenAdd}>
          <i className="bi bi-plus-circle"></i> Add Promotion
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
                <th>Redirect Link</th>
                <th>Promo ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.length > 0 ? (
                promotions.map(promo => (
                  <tr key={promo.id}>
                    <td>
                      <img 
                        src={promo.imageUrl} 
                        alt="Promo slider" 
                        style={{ width: '120px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} 
                      />
                    </td>
                    <td className="align-middle">
                      {promo.link ? (
                        <a href={promo.link} target="_blank" rel="noopener noreferrer" className="text-info font-monospace small">
                          {promo.link.substring(0, 45)}{promo.link.length > 45 ? '...' : ''}
                        </a>
                      ) : (
                        <span className="text-secondary small">No Redirect Link</span>
                      )}
                    </td>
                    <td className="align-middle font-monospace text-secondary small">{promo.id}</td>
                    <td className="align-middle">
                      <button className="btn btn-sm btn-info me-2" onClick={() => handleOpenEdit(promo)}>
                        <i className="bi bi-pencil-square"></i>
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(promo.id)}>
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-secondary py-3">No promotions found.</td>
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
              <h5 className="modal-title m-0">{editId ? 'Edit Promotion' : 'Add New Promotion'}</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
            </div>

            <form onSubmit={handleSubmit}>
              {msg && <div className={`alert alert-${msg.type} py-2 small`}>{msg.text}</div>}

              <div className="form-group">
                <label className="form-label">Slide Image URL</label>
                <input 
                  type="url" 
                  className="form-control"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Redirect Link (Optional)</label>
                <input 
                  type="url" 
                  className="form-control"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Or Upload Slide Image File</label>
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

export default AdminPromotions;
