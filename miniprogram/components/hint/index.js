Component({
  properties: { title: String, text: String },
  methods: {
    dismiss() {
      this.triggerEvent('dismiss')
    },
  },
})
