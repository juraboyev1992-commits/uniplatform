import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
                    <h1 style={{ color: '#ef4444', fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
                    <div style={{ backgroundColor: '#f3f4f6', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <p style={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>
                            {this.state.error && this.state.error.toString()}
                        </p>
                        <details style={{ whiteSpace: 'pre-wrap', color: '#6b7280', fontSize: '14px', fontFamily: 'monospace' }}>
                            <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>View Component Stack</summary>
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </details>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
