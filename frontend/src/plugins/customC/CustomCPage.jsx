import { useState, useEffect } from 'react';
import api from '../../core/services/api';

export default function CustomCPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/plugins/customC')
            .then(res => setItems(res.data))
            .catch(err => console.error('Failed to load customC data', err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2 className="page-title">⚡ Custom C Page</h2>
                <p className="page-description">Dynamically loaded plugin page without modifying core business logic.</p>
            </div>
            <div className="card">
                <h3 className="card-title" style={{ marginBottom: '1rem' }}>Plugin Data</h3>
                {loading ? (
                    <p>Loading Custom C data...</p>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Title</th>
                                    <th>Category</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.id}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                                        <td>{item.category}</td>
                                        <td><span className="badge badge-success">{item.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
