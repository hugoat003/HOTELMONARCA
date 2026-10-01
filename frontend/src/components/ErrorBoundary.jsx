import { Component } from 'react';

// Si una pantalla falla, muestra un aviso en lugar de dejar la app en blanco.
// Los datos no se tocan: están en el store, fuera de este componente.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error en la pantalla:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state error-screen" role="alert">
        <div className="panel-title">Algo salió mal</div>
        <div>Esta pantalla tuvo un problema. Tus datos están a salvo.</div>
        <div className="panel-sub text-xs">{String(this.state.error.message || this.state.error)}</div>
        <div className="chips">
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Volver al inicio
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
