/**
 * usePassTemplates: loads the festival's pass templates, starters and festival context
 * (name, logo, venue, dates, categories, custom form fields) for printing and previews.
 *
 * loadFull(template) returns the template with its background image and uploaded element images
 * (cached per id), because the list response leaves images out to stay small.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

export default function usePassTemplates({ enabled = true } = {}) {
  const [state, setState] = useState({ loading: enabled, error: '', templates: [], starters: [], festival: {}, categories: [], customFields: [], choiceFields: [], qrSettings: null, canManage: false });
  const fullCache = useRef(new Map());

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await api.get('/pass-templates');
      fullCache.current.clear();
      setState({
        loading: false,
        error: '',
        templates: res.data.templates || [],
        starters: res.data.starters || [],
        festival: res.data.festival || {},
        categories: res.data.categories || [],
        customFields: res.data.custom_fields || [],
        choiceFields: res.data.choice_fields || [],
        qrSettings: res.data.qr_settings || null,
        canManage: Boolean(res.data.can_manage),
        limits: res.data.limits || {}
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.response?.data?.message || 'Could not load the pass templates.' }));
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const loadFull = useCallback(async (template) => {
    if (!template) return null;
    if (template.is_starter || (!template.has_image && !template.has_assets)) return template;
    const cached = fullCache.current.get(template.id);
    if (cached) return cached;
    const res = await api.get(`/pass-templates/${template.id}`);
    const full = res.data.template;
    fullCache.current.set(template.id, full);
    return full;
  }, []);

  // Festival-wide QR Settings (QR-only stickers); needs settings.manage
  const saveQrSettings = useCallback(async (settings) => {
    const res = await api.put('/pass-templates/qr-settings', settings);
    setState((s) => ({ ...s, qrSettings: res.data.qr_settings }));
    return res.data.qr_settings;
  }, []);

  return { ...state, reload, loadFull, saveQrSettings };
}
