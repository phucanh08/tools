import { useId, useState, type DragEvent } from 'react'

interface Props {
  onFile: (file: File) => void
  label?: string
  accept?: string
  file?: File | null
}

/** File input with a drag & drop zone. Files are read locally only. */
export function FilePicker({ onFile, label = 'Choose a file or drop it here', accept, file }: Props) {
  const id = useId()
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <label
      htmlFor={id}
      className={`dropzone${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        id={id}
        type="file"
        className="visually-hidden"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          // Allow picking the same file again.
          e.target.value = ''
        }}
      />
      <span className="dropzone-title">{label}</span>
      <span className="dropzone-hint">{file ? `Selected: ${file.name}` : 'The file stays on your device.'}</span>
    </label>
  )
}
