import {useEffect, useState} from 'react';
import {Icon} from '../components/UI';
import {loadTransportRegistration, saveTransportRegistration} from '../services/siga';

export default function Transport({notify}: {notify: (message: string) => void}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uses, setUses] = useState<boolean | null>(null);
  const [responsible, setResponsible] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    loadTransportRegistration().then((data) => {
      setUses(data.usesTransport);
      setResponsible(data.responsibleName);
      setAddress(data.address);
      setNeighborhood(data.neighborhood);
      setRegistered(data.registered);
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (uses === null) {
      notify('Informe se utiliza transporte escolar.');
      return;
    }
    if (uses && (!responsible.trim() || !address.trim() || !neighborhood.trim())) {
      notify('Preencha o responsável, o endereço e o bairro.');
      return;
    }
    setSaving(true);
    try {
      await saveTransportRegistration({
        usesTransport: uses,
        responsibleName: responsible.trim(),
        address: address.trim(),
        neighborhood: neighborhood.trim(),
      });
      setRegistered(true);
      notify('Cadastro de transporte escolar salvo.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="surface padded transport-form"><p>Carregando cadastro…</p></section>;

  return <section className="surface padded transport-form">
    <div className="transport-heading">
      <div className="icon-box blue"><Icon name="bus"/></div>
      <div><h2>Transporte escolar</h2><p>Informe os dados usados no levantamento da escola.</p></div>
    </div>
    {registered && <div className="transport-saved"><Icon name="check"/> Cadastro já respondido. Você pode atualizá-lo.</div>}
    <fieldset>
      <legend>Você utiliza transporte escolar?</legend>
      <div className="transport-choice">
        <label className={uses === true ? 'active' : ''}><input type="radio" name="uses-transport" checked={uses === true} onChange={() => setUses(true)}/>Sim</label>
        <label className={uses === false ? 'active' : ''}><input type="radio" name="uses-transport" checked={uses === false} onChange={() => setUses(false)}/>Não</label>
      </div>
    </fieldset>
    {uses && <div className="transport-fields">
      <label><span>Nome do responsável</span><input value={responsible} onChange={(e) => setResponsible(e.target.value)} autoComplete="name"/></label>
      <label><span>Endereço</span><input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address"/></label>
      <label><span>Bairro</span><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}/></label>
    </div>}
    <button className="primary" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar cadastro'}</button>
  </section>;
}
